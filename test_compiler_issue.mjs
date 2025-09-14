import { ExpressionCompilerImpl } from './src/modash/crossfilter-compiler.js';

const compiler = new ExpressionCompilerImpl();

const projectExpr = {
  displayName: { $toUpper: '$name' },
  passed: { $gte: ['$score', 90] },
};

const compiledFn = compiler.compileProjectExpr(projectExpr);

const testDocs = [
  { _id: 1, name: 'Alice', score: 95 },
  { _id: 2, name: 'Bob', score: 85 },
  { _id: 3, name: 'Charlie', score: 90 },
];

console.log('Testing compiled projection function:');
testDocs.forEach((doc, i) => {
  const result = compiledFn(doc, i);
  console.log(`Input:`, doc);
  console.log(`Output:`, result);
  console.log('---');
});