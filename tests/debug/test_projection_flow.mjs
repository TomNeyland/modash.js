import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';
import { ProjectOperator, LimitOperator } from '../../src/modash/crossfilter-operators';
import { ExpressionCompilerImpl } from '../../src/modash/crossfilter-compiler';

// Test the operators directly
const compiler = new ExpressionCompilerImpl();

// Create operators
const projectOp = new ProjectOperator(
  {
    displayName: { $toUpper: '$name' },
    passed: { $gte: ['$score', 90] },
  },
  compiler
);

const limitOp = new LimitOperator(2);

// Create a fake store
const store = {
  documents: [
    { _id: 1, name: 'Alice', score: 95 },
    { _id: 2, name: 'Bob', score: 85 },
    { _id: 3, name: 'Charlie', score: 90 },
  ],
  liveSet: new Set([0, 1, 2]),
  dimensions: new Map(),
  groups: new Map(),
  stats: { totalDocs: 3, liveDocs: 3, dimensionsCreated: 0, groupsActive: 0 },
  rowIdCounter: { current: 3 },
};

// Create context
const context = {
  pipeline: [{ $project: {} }, { $limit: 2 }],
  stageIndex: 0,
  compiledStage: { type: '$project' },
  executionPlan: {},
  tempState: new Map(),
  upstreamActiveIds: Array.from(store.liveSet), // Add active IDs for proper data flow
};

console.log('\n📋 Testing ProjectOperator.onAdd:');

// Process documents through project
context.stageIndex = 0;
projectOp.onAdd({ rowId: 0, sign: 1 }, store, context);
projectOp.onAdd({ rowId: 1, sign: 1 }, store, context);
projectOp.onAdd({ rowId: 2, sign: 1 }, store, context);

console.log('Context keys after project:', Array.from(context.tempState.keys()));
const projectedDocs = context.tempState.get('projected_docs_stage_0');
if (projectedDocs) {
  console.log('Projected docs count:', projectedDocs.size);
  console.log('Doc 0:', projectedDocs.get(0));
  console.log('Doc 1:', projectedDocs.get(1));
}

console.log('\n📋 Testing LimitOperator.snapshot:');

// Update context for limit stage
context.stageIndex = 1;
context.compiledStage = { type: '$limit' };

// Test limit snapshot
const limitResult = limitOp.snapshot(store, context);
console.log('Limit result:', limitResult);