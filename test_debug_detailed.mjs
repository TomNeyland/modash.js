import { createCrossfilterEngine } from './src/modash/crossfilter-engine.js';
import { ProjectOperator, LimitOperator } from './src/modash/crossfilter-operators.js';
import { ExpressionCompilerImpl } from './src/modash/crossfilter-compiler.js';

// Test data
const testData = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
  { _id: 3, name: 'Charlie', score: 90 },
];

// Pipeline with projection and limit
const pipeline = [
  {
    $project: {
      displayName: { $toUpper: '$name' },
      passed: { $gte: ['$score', 90] },
    },
  },
  { $limit: 2 },
];

// Create engine and test
const engine = createCrossfilterEngine();

// Add documents
testData.forEach(doc => engine.addDocument(doc));

// Compile the pipeline
const plan = engine.compilePipeline(pipeline);

// Create operators manually to test
const compiler = new ExpressionCompilerImpl();
const projectOp = new ProjectOperator(pipeline[0].$project, compiler);
const limitOp = new LimitOperator(2);

// Create context
const context = {
  pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })),
  stageIndex: 0,
  compiledStage: plan.stages[0],
  executionPlan: plan,
  tempState: new Map(),
};

console.log('\n📋 Simulating snapshotPipeline flow:');
console.log('Processing documents through onAdd...');

// Simulate what snapshotPipeline does
for (const rowId of engine.store.liveSet) {
  const delta = { rowId, sign: 1 };

  // Stage 0: ProjectOperator
  context.stageIndex = 0;
  context.compiledStage = plan.stages[0];
  const projectDeltas = projectOp.onAdd(delta, engine.store, context);
  console.log(`  ProjectOperator.onAdd(rowId=${rowId}) -> ${projectDeltas.length} deltas`);

  // Stage 1: LimitOperator
  context.stageIndex = 1;
  context.compiledStage = plan.stages[1];
  for (const projectDelta of projectDeltas) {
    const limitDeltas = limitOp.onAdd(projectDelta, engine.store, context);
    console.log(`  LimitOperator.onAdd(rowId=${rowId}) -> ${limitDeltas.length} deltas`);
  }
}

console.log('\nContext tempState keys:', Array.from(context.tempState.keys()));
const projectedDocs = context.tempState.get('projected_docs_stage_0');
if (projectedDocs) {
  console.log('Projected docs count:', projectedDocs.size);
  for (const [rowId, doc] of projectedDocs) {
    console.log(`  rowId ${rowId}:`, doc);
  }
}

console.log('\n📋 Calling LimitOperator.snapshot:');
context.stageIndex = 1;
context.compiledStage = plan.stages[1];
const result = limitOp.snapshot(engine.store, context);
console.log('Result count:', result.length);
result.forEach((doc, i) => {
  console.log(`  Doc ${i}:`, doc);
});

console.log('\n📋 Full engine execution:');
const engineResult = engine.execute(pipeline);
console.log('Engine result:', JSON.stringify(engineResult, null, 2));