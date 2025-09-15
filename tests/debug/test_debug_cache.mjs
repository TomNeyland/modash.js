import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';

// Test data
const testData = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
];

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

// Compile and execute pipeline
console.log('\n📋 Compiling pipeline...');
const plan = engine.compilePipeline(pipeline);

// Get the operators
const pipelineKey = JSON.stringify(pipeline);
const operators = engine.compiledOperators.get(pipelineKey);

if (operators) {
  console.log('\n📋 Found operators:', operators.map(op => op.type));

  // Create a test context
  const testContext = {
    pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })),
    stageIndex: 0,
    compiledStage: plan.stages[0],
    executionPlan: plan,
    tempState: new Map(),
  };

  // Test ProjectOperator.onAdd
  console.log('\n📋 Testing ProjectOperator.onAdd:');
  const projectOp = operators[0];
  testContext.stageIndex = 0;
  projectOp.onAdd({ rowId: 0, sign: 1 }, engine.store, testContext);

  console.log('Context tempState after project:', Array.from(testContext.tempState.keys()));
  const projectedDocs = testContext.tempState.get('projected_docs_stage_0');
  if (projectedDocs) {
    console.log('Projected doc for rowId 0:', projectedDocs.get(0));
  }

  // Test LimitOperator with context
  console.log('\n📋 Testing LimitOperator.snapshot:');
  const limitOp = operators[1];
  testContext.stageIndex = 1;

  // First process through onAdd to simulate the flow
  projectOp.onAdd({ rowId: 1, sign: 1 }, engine.store, testContext);

  const limitResult = limitOp.snapshot(engine.store, testContext);
  console.log('Limit result:', limitResult);
}

// Now test full execution
console.log('\n📋 Full execution:');
const result = engine.execute(pipeline);
console.log('Result:', result);