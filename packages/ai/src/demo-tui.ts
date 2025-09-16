#!/usr/bin/env node

/**
 * Demo script to showcase TUI functionality without requiring OpenAI API key
 */

import { SimpleTUIManager } from './simple-tui.js';
import { createDefaultPresentationSpec } from './tui-integration.js';

// Sample data
const sampleData = [
  { name: 'Alice', age: 30, department: 'Engineering', salary: 95000, score: 85 },
  { name: 'Bob', age: 25, department: 'Marketing', salary: 70000, score: 92 },
  { name: 'Carol', age: 35, department: 'Engineering', salary: 105000, score: 88 },
  { name: 'Dave', age: 28, department: 'Sales', salary: 65000, score: 76 },
  { name: 'Eva', age: 32, department: 'Marketing', salary: 75000, score: 94 },
];

// Mock aggregation result (e.g., "average salary by department")
const aggregationResult = [
  { _id: 'Engineering', avgSalary: 100000, count: 2 },
  { _id: 'Marketing', avgSalary: 72500, count: 2 },
  { _id: 'Sales', avgSalary: 65000, count: 1 },
];

async function runDemo() {
  console.log('🚀 aggo-ai TUI Demo');
  console.log('===================');
  console.log();
  console.log('Sample query: "average salary by department"');
  console.log();
  console.log('📊 Sample data:');
  sampleData.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.name} - ${item.department} - $${item.salary.toLocaleString()}`);
  });
  console.log();
  console.log('📈 Query result:');
  aggregationResult.forEach(item => {
    console.log(`  ${item._id}: $${item.avgSalary.toLocaleString()} avg (${item.count} employees)`);
  });
  console.log();
  console.log('🖥️  Launching Terminal UI in 2 seconds...');
  console.log('    (Press "q" to quit once it starts)');
  
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Create a presentation spec for the results
  const spec = createDefaultPresentationSpec('table', aggregationResult);
  
  // Override with a better spec for this demo
  spec.layout.children = [
    {
      id: 'results-table',
      kind: 'table',
      title: 'Average Salary by Department',
      bind: {
        path: '$.rows',
        columns: [
          { key: '_id', label: 'Department', align: 'left' },
          { key: 'avgSalary', label: 'Avg Salary', align: 'right' },
          { key: 'count', label: 'Count', align: 'right' },
        ],
      },
      width: '100%',
      height: '100%',
      fmt: {
        number: '0,0',
      },
    },
  ];

  // Prepare TUI data
  const tuiData = {
    rows: aggregationResult,
    meta: {
      count: aggregationResult.length,
      query: 'average salary by department',
      executionTime: 42, // ms
    },
  };

  // Render TUI
  const tuiManager = new SimpleTUIManager();
  await tuiManager.renderTUI(tuiData, spec);
}

// Handle command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { runDemo };