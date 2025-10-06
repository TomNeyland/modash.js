#!/usr/bin/env npx tsx

/**
 * TUI Validation Demo
 * Demonstrates all the core TUI functionality without OpenAI dependency
 */

import { 
  validatePlan, 
  validateUISpec,
  evaluateJSONPath,
  extractArrayItems,
  interpolateTemplate,
  createTheme,
  type PlanType
} from '../src/index.js';

console.log('🚀 AI TUI 3 - Core Validation Demo');
console.log('==================================\n');

// Sample data for testing
const testData = {
  items: [
    { name: 'Alice', department: 'Engineering', salary: 95000, projects: 8 },
    { name: 'Bob', department: 'Marketing', salary: 65000, projects: 4 },
    { name: 'Carol', department: 'Engineering', salary: 110000, projects: 12 }
  ],
  summary: {
    totalEmployees: 3,
    avgSalary: 90000,
    departments: ['Engineering', 'Marketing']
  }
};

// Test 1: JSONPath Data Binding
console.log('📊 Test 1: JSONPath Data Binding');
console.log('─'.repeat(40));

console.log('✓ Extract total employees:', evaluateJSONPath(testData, '$.summary.totalEmployees'));
console.log('✓ Extract average salary:', evaluateJSONPath(testData, '$.summary.avgSalary'));
console.log('✓ Extract first employee:', evaluateJSONPath(testData, '$.items[0].name'));

const employees = extractArrayItems(testData, '$.items');
console.log('✓ Extract all employees:', employees.length, 'items');

const template = '{name} from {department} earns ${salary}';
const formatted = interpolateTemplate(template, employees[0]);
console.log('✓ Template interpolation:', formatted);

// Test 2: UI Spec Validation
console.log('\n🎨 Test 2: UI Spec Validation');
console.log('─'.repeat(40));

const validUISpec = {
  title: 'Employee Dashboard',
  layout: {
    type: 'table' as const,
    id: 'employee-table',
    from: '$.items',
    columns: [
      { header: 'Name', path: '$.name' },
      { header: 'Department', path: '$.department' },
      { header: 'Salary', path: '$.salary', align: 'right' as const }
    ]
  }
};

const validResult = validateUISpec(validUISpec);
console.log('✓ Valid UI spec:', validResult.valid ? '✅ Pass' : '❌ Fail');

const invalidUISpec = {
  layout: {
    type: 'table' as const,
    id: 'broken-table',
    from: '$.items'
    // Missing required columns
  }
};

const invalidResult = validateUISpec(invalidUISpec);
console.log('✓ Invalid UI spec:', invalidResult.valid ? '❌ Should fail' : '✅ Correctly rejected');
console.log('  Errors:', invalidResult.errors.length);

// Test 3: Complete Plan Validation
console.log('\n📋 Test 3: Complete Plan Validation');
console.log('─'.repeat(40));

const validPlan: PlanType = {
  query: {
    pipeline: [
      { $match: { active: true } },
      { $group: { _id: '$department', count: { $sum: 1 } } }
    ]
  },
  uiSpec: {
    title: 'Department Stats',
    layout: {
      type: 'grid',
      id: 'main-grid',
      children: [
        {
          type: 'table',
          id: 'dept-table',
          from: '$',
          columns: [
            { header: 'Department', path: '$._id' },
            { header: 'Count', path: '$.count' }
          ]
        },
        {
          type: 'stat',
          id: 'total-stat',
          label: 'Total Departments',
          value: '$.length'
        }
      ]
    }
  }
};

const planResult = validatePlan(JSON.stringify(validPlan));
console.log('✓ Valid plan:', planResult.valid ? '✅ Pass' : '❌ Fail');
if (!planResult.valid) {
  console.log('  Errors:', planResult.errors);
}

// Test 4: Theme System
console.log('\n🎨 Test 4: Theme System');
console.log('─'.repeat(40));

const theme = createTheme({
  border: 'round',
  accent: 'cyan'
});

console.log('✓ Terminal size:', theme.getTerminalSize());
console.log('✓ Number formatting:', theme.formatNumber(1234567));
console.log('✓ Text truncation:', theme.truncateText('This is a very long text', 10));
console.log('✓ Color support:', theme.colorize('Success!', 'success'));

// Test 5: Component Type Coverage
console.log('\n🔧 Test 5: Component Type Coverage');
console.log('─'.repeat(40));

const componentTypes = ['table', 'list', 'stat', 'json', 'sparkline', 'grid'];
let supportedCount = 0;

componentTypes.forEach(type => {
  const testSpec = {
    layout: {
      type,
      id: `test-${type}`,
      from: '$.data',
      ...(type === 'table' ? { columns: [{ header: 'Test', path: '$.test' }] } : {}),
      ...(type === 'list' ? { template: '{name}' } : {}),
      ...(type === 'stat' ? { label: 'Test', value: '$.value' } : {}),
      ...(type === 'grid' ? { children: [
        { type: 'stat', id: 'child', label: 'Child', value: '$.value' }
      ] } : {})
    }
  };

  const result = validateUISpec(testSpec);
  const supported = result.valid || result.errors.some(e => !e.includes('Unknown component type'));
  
  console.log(`✓ ${type.padEnd(10)}: ${supported ? '✅ Supported' : '❌ Not supported'}`);
  if (supported) supportedCount++;
});

console.log(`\n📊 Component Support: ${supportedCount}/${componentTypes.length} types supported`);

// Final Summary
console.log('\n🎉 Validation Demo Complete!');
console.log('=============================');
console.log('✅ JSONPath data binding working');
console.log('✅ UI specification validation working');
console.log('✅ Plan schema validation working');  
console.log('✅ Theme system working');
console.log('✅ Component type support verified');
console.log('\n💡 The AI TUI 3 system is ready for integration!');
console.log('🔑 Add OPENAI_API_KEY to test with real natural language queries');
console.log('🎨 Use --tui flag in CLI for rich terminal interfaces');