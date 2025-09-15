import { ExpressionCompilerImpl } from '../../src/modash/crossfilter-compiler';

const compiler = new ExpressionCompilerImpl();

const projectExpr = {
  displayName: { $toUpper: '$name' },
  passed: { $gte: ['$score', 90] },
};

console.log('Project expression:', projectExpr);

// Get the compiled function
const compiledFn = compiler.compileProjectExpr(projectExpr);

// Convert function to string to see its code
console.log('\nCompiled function code:');
console.log(compiledFn.toString());

// Test it
const testDoc = { _id: 1, name: 'Alice', score: 95 };
console.log('\nTest document:', testDoc);

const result = compiledFn(testDoc, 0);
console.log('Result:', result);

// Now test with a simpler projection
const simpleExpr = { name: 1, score: 1 };
const simpleFn = compiler.compileProjectExpr(simpleExpr);
console.log('\nSimple projection:', simpleExpr);
console.log('Simple result:', simpleFn(testDoc, 0));