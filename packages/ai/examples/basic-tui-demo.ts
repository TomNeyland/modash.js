#!/usr/bin/env npx tsx

/**
 * Basic TUI Demo - Shows AI TUI 3 functionality without OpenAI
 * This creates a mock plan and renders it to demonstrate the TUI system
 */

import { renderTUI, validatePlan, type PlanType } from '../src/index.js';

// Sample data for demonstration
const sampleData = [
  { name: 'Alice', age: 30, department: 'Engineering', salary: 75000, active: true },
  { name: 'Bob', age: 25, department: 'Marketing', salary: 65000, active: true },
  { name: 'Carol', age: 35, department: 'Engineering', salary: 85000, active: false },
  { name: 'David', age: 28, department: 'Sales', salary: 70000, active: true },
  { name: 'Eva', age: 32, department: 'Marketing', salary: 72000, active: true },
];

// Mock plan that demonstrates various TUI components
const mockPlan: PlanType = {
  query: {
    pipeline: [
      { $match: { active: true } },
      { $group: { _id: '$department', avgSalary: { $avg: '$salary' }, count: { $sum: 1 } } },
      { $sort: { avgSalary: -1 } }
    ]
  },
  uiSpec: {
    title: '📊 Employee Analysis Dashboard',
    layout: {
      type: 'grid',
      id: 'main-dashboard',
      direction: 'row',
      gap: 2,
      children: [
        {
          type: 'table',
          id: 'department-stats',
          from: '$',
          columns: [
            { header: 'Department', path: '$._id', align: 'left' },
            { header: 'Avg Salary', path: '$.avgSalary', align: 'right' },
            { header: 'Count', path: '$.count', align: 'right' }
          ],
          sort: { path: '$.avgSalary', dir: 'desc' }
        },
        {
          type: 'grid',
          id: 'stats-panel',
          direction: 'column',
          children: [
            {
              type: 'stat',
              id: 'total-departments',
              label: 'Departments',
              value: '$.length'
            },
            {
              type: 'stat',
              id: 'avg-team-size',
              label: 'Avg Team Size',
              value: '$.avgTeamSize',
              unit: 'people'
            }
          ]
        }
      ]
    },
    interactions: {
      enablePagination: true
    },
    theme: {
      border: 'round',
      accent: 'cyan'
    }
  },
  hints: {
    primaryKey: '_id',
    expectedRows: 3
  }
};

async function runDemo() {
  console.log('🚀 AI TUI 3 Demo - Basic TUI Rendering');
  console.log('=====================================\n');

  // Step 1: Validate the plan
  console.log('📋 Validating UI specification...');
  const validation = validatePlan(JSON.stringify(mockPlan));
  if (!validation.valid) {
    console.error('❌ Plan validation failed:');
    validation.errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  console.log('✅ Plan validation passed\n');

  // Step 2: Execute the query (simulate aggo execution)
  console.log('⚡ Executing query...');
  
  // Simulate the aggregation result
  const queryResults = [
    { _id: 'Engineering', avgSalary: 80000, count: 2 },
    { _id: 'Marketing', avgSalary: 68500, count: 2 },
    { _id: 'Sales', avgSalary: 70000, count: 1 }
  ];
  
  // Add computed stats for the stat components
  (queryResults as any).length = queryResults.length;
  (queryResults as any).avgTeamSize = queryResults.reduce((sum, dept) => sum + dept.count, 0) / queryResults.length;
  
  console.log('✅ Query executed successfully\n');

  // Step 3: Display the mock result data
  console.log('📊 Query Results:');
  console.log(JSON.stringify(queryResults, null, 2));
  console.log('\n');

  // Step 4: Render the TUI
  console.log('🎨 Launching TUI (Press "q" to exit)...\n');
  
  try {
    renderTUI({
      plan: mockPlan,
      results: queryResults,
      validation
    }, {
      onExit: () => {
        console.log('\n👋 TUI Demo completed successfully!');
        console.log('💡 Try the real AI version with: aggo ai "your query" --tui');
      }
    });
  } catch (error) {
    console.error('❌ TUI rendering failed:', error);
    console.error('This might be due to missing terminal capabilities or dependencies');
  }
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemo().catch(console.error);
}

export { runDemo, mockPlan, sampleData };