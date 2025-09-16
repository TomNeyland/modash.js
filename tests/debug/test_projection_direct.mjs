import { ExpressionCompilerImpl } from '../../src/aggo/crossfilter-compiler';

// Test the projection compiler directly
const compiler = new ExpressionCompilerImpl();

const projectExpr = {
  displayName: { $toUpper: '$name' },
  passed: { $gte: ['$score', 90] },
};

console.log('\n📋 Compiling projection expression...');
const compiledFn = compiler.compileProjectExpr(projectExpr);

console.log('\n📋 Testing compiled function:');
const testDoc = { _id: 1, name: 'Alice', score: 95 };
const result = compiledFn(testDoc, 0);
console.log('Input:', testDoc);
console.log('Output:', result);