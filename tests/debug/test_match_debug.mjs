import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';

const testData = [
  { _id: 1, name: 'Alice', tags: ['developer', 'senior'] },
  { _id: 2, name: 'Bob', tags: ['designer'] },
  { _id: 3, name: 'Charlie', tags: ['developer', 'lead'] },
  { _id: 4, name: 'David', skills: null },
];

process.env.DEBUG_IVM = 'true';

const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

console.log('\n--- Testing $match with $exists ---');
const matchResult = engine.execute([
  { $match: { tags: { $exists: true } } }
]);

console.log('Match result count:', matchResult.length);
console.log('Names:', matchResult.map(d => d.name));