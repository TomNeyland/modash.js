import { createCrossfilterEngine } from './src/modash/crossfilter-engine.js';

const testDoc = [
  { _id: 1, tags: ['red', 'blue'], name: 'item1' },
  { _id: 2, tags: ['green'], name: 'item2' },
];

const pipeline = [{ $unwind: '$tags' }];

// Enable debug
process.env.DEBUG_IVM = 'true';

const engine = createCrossfilterEngine();

// Add documents
console.log('Adding documents...');
testDoc.forEach(doc => engine.addDocument(doc));

console.log('\nLive set before compilation:', Array.from(engine.store.liveSet));
console.log('Documents before compilation:');
for (const rowId of engine.store.liveSet) {
  console.log(`  ${rowId}:`, engine.store.documents[rowId]);
}

// Compile pipeline
console.log('\n--- Compiling pipeline ---');
const plan = engine.compilePipeline(pipeline);

console.log('\nLive set after compilation:', Array.from(engine.store.liveSet));
console.log('Documents after compilation:');
for (const rowId of engine.store.liveSet) {
  console.log(`  ${rowId}:`, engine.store.documents[rowId]);
}

// Execute pipeline
console.log('\n--- Executing pipeline ---');
const result = engine.execute(pipeline);

console.log('\nResult count:', result.length);
console.log('Result:', JSON.stringify(result, null, 2));