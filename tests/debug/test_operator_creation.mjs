import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine.js';
import { ExpressionCompilerImpl } from '../../src/modash/crossfilter-compiler.js';
import { ProjectOperator } from '../../src/modash/crossfilter-operators.js';

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

// Create engine and compile pipeline
const engine = createCrossfilterEngine();
testData.forEach(doc => engine.addDocument(doc));

console.log('Pipeline:', JSON.stringify(pipeline, null, 2));

// Compile the pipeline
const plan = engine.compilePipeline(pipeline);
console.log('\nExecution plan stages:', plan.stages.map(s => ({ type: s.type, data: s.stageData })));

// Now let's manually create a ProjectOperator with the same expression
const compiler = new ExpressionCompilerImpl();
const projectExpr = pipeline[0].$project;
console.log('\nProject expression:', projectExpr);

const manualOperator = new ProjectOperator(projectExpr, compiler);

// Create a test context
const testContext = {
  pipeline: plan.stages.map(s => ({ [s.type]: s.stageData })),
  stageIndex: 0,
  compiledStage: plan.stages[0],
  executionPlan: plan,
  tempState: new Map(),
};

// Test the operator
const delta = { rowId: 0, sign: 1 };
console.log('\nTesting manual ProjectOperator.onAdd:');
console.log('Input delta:', delta);
console.log('Input document:', engine.store.documents[0]);

const result = manualOperator.onAdd(delta, engine.store, testContext);
console.log('Output deltas:', result);

// Check what was cached
const cachedDocs = testContext.tempState.get('projected_docs_stage_0');
if (cachedDocs) {
  console.log('\nCached documents:');
  for (const [rowId, doc] of cachedDocs) {
    console.log(`  rowId ${rowId}:`, doc);
  }
}