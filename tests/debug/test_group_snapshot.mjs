import { createCrossfilterEngine } from '../../src/modash/crossfilter-engine';
import { GroupOperator } from '../../src/modash/crossfilter-operators';
import { ExpressionCompilerImpl } from '../../src/modash/crossfilter-compiler';

const data = [
  { category: 'electronics', price: 100, quantity: 2 },
  { category: 'furniture', price: 200, quantity: 1 },
];

const groupExpr = {
  _id: '$category',
  totalRevenue: { $sum: { $multiply: ['$price', '$quantity'] } },
  itemCount: { $sum: 1 },
};

// Create engine and add data
const engine = createCrossfilterEngine();
data.forEach(doc => engine.addDocument(doc));

// Create GroupOperator manually
const compiler = new ExpressionCompilerImpl();
const groupOp = new GroupOperator(groupExpr, compiler);

// Create context
const context = {
  pipeline: [{ $group: groupExpr }],
  stageIndex: 0,
  compiledStage: { type: '$group', stageData: groupExpr },
  executionPlan: {},
  tempState: new Map(),
};

// Process documents through onAdd
console.log('Processing documents through onAdd:');
for (const rowId of engine.store.liveSet) {
  const delta = { rowId, sign: 1 };
  const result = groupOp.onAdd(delta, engine.store, context);
  console.log(`  rowId ${rowId} -> ${JSON.stringify(result)}`);
}

// Check group state
console.log('\nChecking group state in store:');
const groupsKey = `group_${JSON.stringify(groupExpr)}`;
const groupsMap = engine.store.groups.get(groupsKey);
if (groupsMap) {
  console.log(`Found ${groupsMap.size} groups:`);
  for (const [key, state] of groupsMap) {
    console.log(`  Group ${key}:`, state.materializeResult());
  }
}

// Call snapshot
console.log('\nCalling GroupOperator.snapshot:');
const snapshotResult = groupOp.snapshot(engine.store, context);
console.log('Snapshot result:', JSON.stringify(snapshotResult, null, 2));