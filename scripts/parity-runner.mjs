#!/usr/bin/env node
import Modash, { createStreamingCollection } from '../src/index.ts';

const base = [
  { _id: 1, a: 1, b: [1, 2], g: 'X' },
  { _id: 2, a: 2, b: [], g: 'Y' },
  { _id: 3, a: null, b: [3], g: 'X' },
  { _id: 4, a: 4, b: null, g: 'Z' },
];

const cases = [
  { name: 'projection-only', p: [{ $project: { a: 1, _id: 0 } }] },
  { name: 'match+project', p: [{ $match: { g: 'X' } }, { $project: { a: 1 } }] },
  { name: 'group+project+sort', p: [
    { $group: { _id: '$g', count: { $sum: 1 } } },
    { $project: { group: '$_id', count: 1, _id: 0 } },
    { $sort: { group: 1 } },
  ]},
  { name: 'unwind-empty-skip', p: [{ $unwind: '$b' }] },
  { name: 'unwind-preserve', p: [{ $unwind: { path: '$b', preserveNullAndEmptyArrays: true } }] },
  { name: 'chain-addFields-project-group', p: [
    { $addFields: { c: { $add: ['$a', 1] } } },
    { $project: { g: 1, c: 1 } },
    { $group: { _id: '$g', avg: { $avg: '$c' } } },
  ]},
];

const sortJSON = (arr) => [...arr].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

let failures = 0;
for (const c of cases) {
  const arrResult = Modash.aggregate(base, c.p);
  const sc = createStreamingCollection(base);
  const streamResult = sc.aggregate(c.p);
  sc.destroy();
  const ok = JSON.stringify(sortJSON(arrResult)) === JSON.stringify(sortJSON(streamResult));
  if (!ok) {
    failures++;
    console.error(`[PARITY FAIL] ${c.name}`);
    console.error('array   :', JSON.stringify(arrResult));
    console.error('stream  :', JSON.stringify(streamResult));
  } else {
    console.log(`[PARITY OK] ${c.name}`);
  }
}

if (failures > 0) {
  console.error(`Parity failed for ${failures} case(s).`);
  process.exit(1);
} else {
  console.log('Parity runner passed.');
}

