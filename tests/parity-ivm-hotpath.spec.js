import { expect } from 'chai';
import Modash, { createStreamingCollection } from '../src/index';

describe('Parity: Array vs Streaming (Hot Path + IVM)', () => {
  const base = [
    { _id: 1, a: 1, b: [1, 2], g: 'X' },
    { _id: 2, a: 2, b: [], g: 'Y' },
    { _id: 3, a: null, b: [3], g: 'X' },
    { _id: 4, a: 4, b: null, g: 'Z' },
  ];

  const cases = [
    { name: 'projection-only', p: [{ $project: { a: 1, _id: 0 } }] },
    {
      name: 'match+project',
      p: [{ $match: { g: 'X' } }, { $project: { a: 1 } }],
    },
    {
      name: 'group+project+sort',
      p: [
        { $group: { _id: '$g', count: { $sum: 1 } } },
        { $project: { group: '$_id', count: 1, _id: 0 } },
        { $sort: { group: 1 } },
      ],
    },
    { name: 'unwind-empty-skip', p: [{ $unwind: '$b' }] },
    {
      name: 'unwind-preserve',
      p: [{ $unwind: { path: '$b', preserveNullAndEmptyArrays: true } }],
    },
    {
      name: 'chain-addFields-project-group',
      p: [
        { $addFields: { c: { $add: ['$a', 1] } } },
        { $project: { g: 1, c: 1 } },
        { $group: { _id: '$g', avg: { $avg: '$c' } } },
      ],
    },
  ];

  for (const c of cases) {
    it(`parity: ${c.name}`, () => {
      const arrResult = Modash.aggregate(base, c.p);
      const sc = createStreamingCollection(base);
      const streamResult = sc.aggregate(c.p);
      // Sort for parity where order is not guaranteed
      const s = x =>
        [...x].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        );
      expect(s(streamResult)).to.deep.equal(s(arrResult));
      sc.destroy();
    });
  }

  it('parity: randomized pipelines', () => {
    const randBase = Array.from({ length: 20 }, (_, i) => ({
      _id: i + 1,
      v: Math.floor(Math.random() * 10),
      g: `g_${i % 3}`,
      arr: i % 2 === 0 ? [i, i + 1] : [],
    }));

    const ops = ['match', 'project', 'group', 'sort', 'unwind'];
    const rnd = n => Math.floor(Math.random() * n);

    const makePipeline = () => {
      const stages = [];
      const count = 3 + rnd(3);
      for (let i = 0; i < count; i++) {
        const op = ops[rnd(ops.length)];
        if (op === 'match') stages.push({ $match: { v: { $gte: rnd(10) } } });
        else if (op === 'project') stages.push({ $project: { v: 1, g: 1 } });
        else if (op === 'group')
          stages.push({ $group: { _id: '$g', sum: { $sum: '$v' } } });
        else if (op === 'sort') stages.push({ $sort: { v: rnd(2) ? 1 : -1 } });
        else if (op === 'unwind')
          stages.push({
            $unwind: rnd(2)
              ? '$arr'
              : { path: '$arr', preserveNullAndEmptyArrays: true },
          });
      }
      return stages;
    };

    for (let t = 0; t < 10; t++) {
      const p = makePipeline();
      const arrResult = Modash.aggregate(randBase, p);
      const sc = createStreamingCollection(randBase);
      const streamResult = sc.aggregate(p);
      sc.destroy();
      const s = x =>
        [...x].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        );
      expect(s(streamResult)).to.deep.equal(s(arrResult));
    }
  });
});
