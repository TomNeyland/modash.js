#!/usr/bin/env npx tsx

/**
 * Mock TUI Integration Demo
 * Shows how the AI TUI system would work with a simulated TUI planner
 * This demonstrates the full workflow without requiring OpenAI API keys
 */

import { tuiQuery, TUIPlanner, type PlanType } from '../src/index.js';
import { type Document } from 'aggo';

// Enhanced sample dataset for demonstration
const sampleEmployeeData: Document[] = [
  { name: 'Alice Johnson', age: 30, department: 'Engineering', salary: 95000, active: true, projects: 8, level: 'Senior', joinDate: '2020-03-15' },
  { name: 'Bob Smith', age: 25, department: 'Marketing', salary: 65000, active: true, projects: 4, level: 'Junior', joinDate: '2022-07-20' },
  { name: 'Carol Davis', age: 35, department: 'Engineering', salary: 110000, active: false, projects: 12, level: 'Principal', joinDate: '2018-01-10' },
  { name: 'David Wilson', age: 28, department: 'Sales', salary: 75000, active: true, projects: 6, level: 'Mid', joinDate: '2021-05-08' },
  { name: 'Eva Martinez', age: 32, department: 'Marketing', salary: 78000, active: true, projects: 7, level: 'Senior', joinDate: '2019-11-03' },
  { name: 'Frank Chen', age: 29, department: 'Engineering', salary: 88000, active: true, projects: 9, level: 'Senior', joinDate: '2020-09-12' },
  { name: 'Grace Kim', age: 27, department: 'Sales', salary: 68000, active: true, projects: 5, level: 'Mid', joinDate: '2022-02-18' },
  { name: 'Henry Thompson', age: 33, department: 'Engineering', salary: 105000, active: false, projects: 15, level: 'Principal', joinDate: '2017-06-25' },
  { name: 'Irene Wu', age: 26, department: 'Marketing', salary: 62000, active: true, projects: 3, level: 'Junior', joinDate: '2023-01-09' },
  { name: 'Jack Brown', age: 31, department: 'Sales', salary: 82000, active: true, projects: 8, level: 'Senior', joinDate: '2020-12-01' },
];

// Mock TUI Planner that simulates the LLM response
class MockTUIPlanner extends TUIPlanner {
  constructor() {
    super({ apiKey: 'mock-key' }); // Fake API key for demo
  }

  async generatePlan(query: string, schema: any, samples: any[]): Promise<any> {
    console.log(`🤖 Mock AI Processing: "${query}"`);
    
    // Simulate different query types and generate appropriate plans
    if (query.toLowerCase().includes('salary') && query.toLowerCase().includes('department')) {
      return {
        plan: this.createSalaryByDepartmentPlan(),
        rawResponse: 'Mock response',
        usage: { promptTokens: 150, completionTokens: 200, totalTokens: 350 }
      };
    } else if (query.toLowerCase().includes('top') && query.toLowerCase().includes('employee')) {
      return {
        plan: this.createTopEmployeesPlan(),
        rawResponse: 'Mock response',
        usage: { promptTokens: 120, completionTokens: 180, totalTokens: 300 }
      };
    } else if (query.toLowerCase().includes('active') && query.toLowerCase().includes('count')) {
      return {
        plan: this.createActiveEmployeesPlan(),
        rawResponse: 'Mock response',
        usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 }
      };
    } else {
      return {
        plan: this.createGenericTablePlan(query),
        rawResponse: 'Mock response',
        usage: { promptTokens: 80, completionTokens: 120, totalTokens: 200 }
      };
    }
  }

  private createSalaryByDepartmentPlan(): PlanType {
    return {
      query: {
        pipeline: [
          { $match: { active: true } },
          { $group: { 
            _id: '$department', 
            avgSalary: { $avg: '$salary' },
            minSalary: { $min: '$salary' },
            maxSalary: { $max: '$salary' },
            count: { $sum: 1 }
          }},
          { $sort: { avgSalary: -1 } }
        ]
      },
      uiSpec: {
        title: '💰 Salary Analysis by Department',
        layout: {
          type: 'grid',
          id: 'salary-dashboard',
          direction: 'row',
          gap: 2,
          children: [
            {
              type: 'table',
              id: 'salary-by-dept',
              from: '$',
              columns: [
                { header: 'Department', path: '$._id', align: 'left' },
                { header: 'Avg Salary', path: '$.avgSalary', align: 'right' },
                { header: 'Min Salary', path: '$.minSalary', align: 'right' },
                { header: 'Max Salary', path: '$.maxSalary', align: 'right' },
                { header: 'Employees', path: '$.count', align: 'center' }
              ],
              sort: { path: '$.avgSalary', dir: 'desc' }
            },
            {
              type: 'grid',
              id: 'stats-column',
              direction: 'column',
              children: [
                {
                  type: 'stat',
                  id: 'total-departments',
                  label: 'Active Departments',
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
        theme: { border: 'round', accent: 'green' }
      }
    };
  }

  private createTopEmployeesPlan(): PlanType {
    return {
      query: {
        pipeline: [
          { $match: { active: true } },
          { $sort: { projects: -1, salary: -1 } },
          { $limit: 5 }
        ]
      },
      uiSpec: {
        title: '🏆 Top Performing Employees',
        layout: {
          type: 'table',
          id: 'top-employees',
          from: '$',
          columns: [
            { header: 'Name', path: '$.name', align: 'left' },
            { header: 'Department', path: '$.department', align: 'left' },
            { header: 'Projects', path: '$.projects', align: 'right' },
            { header: 'Salary', path: '$.salary', align: 'right' },
            { header: 'Level', path: '$.level', align: 'center' }
          ],
          sort: { path: '$.projects', dir: 'desc' },
          paginate: { size: 10 }
        },
        theme: { border: 'double', accent: 'yellow' }
      }
    };
  }

  private createActiveEmployeesPlan(): PlanType {
    return {
      query: {
        pipeline: [
          { $group: { 
            _id: '$active', 
            count: { $sum: 1 },
            avgSalary: { $avg: '$salary' }
          }}
        ]
      },
      uiSpec: {
        title: '📊 Employee Status Overview',
        layout: {
          type: 'grid',
          id: 'status-grid',
          direction: 'column',
          children: [
            {
              type: 'table',
              id: 'status-breakdown',
              from: '$',
              columns: [
                { header: 'Active', path: '$._id', align: 'center' },
                { header: 'Count', path: '$.count', align: 'right' },
                { header: 'Avg Salary', path: '$.avgSalary', align: 'right' }
              ]
            },
            {
              type: 'grid',
              id: 'stats-row',
              direction: 'row',
              children: [
                {
                  type: 'stat',
                  id: 'total-employees',
                  label: 'Total Employees',
                  value: '$.totalCount'
                },
                {
                  type: 'stat',
                  id: 'active-percentage',
                  label: 'Active Rate',
                  value: '$.activePercentage',
                  unit: '%'
                }
              ]
            }
          ]
        },
        theme: { border: 'single', accent: 'blue' }
      }
    };
  }

  private createGenericTablePlan(query: string): PlanType {
    return {
      query: {
        pipeline: [{ $match: {} }] // No-op, return all data
      },
      uiSpec: {
        title: `📋 Query Results: ${query}`,
        layout: {
          type: 'table',
          id: 'generic-table',
          from: '$',
          columns: [
            { header: 'Name', path: '$.name', align: 'left' },
            { header: 'Age', path: '$.age', align: 'right' },
            { header: 'Department', path: '$.department', align: 'left' },
            { header: 'Salary', path: '$.salary', align: 'right' },
            { header: 'Active', path: '$.active', align: 'center' }
          ],
          paginate: { size: 8 }
        },
        theme: { border: 'round' }
      }
    };
  }
}

async function runMockDemo() {
  console.log('🚀 AI TUI 3 - Mock Integration Demo');
  console.log('===================================\n');

  const queries = [
    'average salary by department for active employees',
    'top 5 employees by project count',
    'count of active vs inactive employees',
    'show all employee data'
  ];

  for (const [index, query] of queries.entries()) {
    console.log(`\n📝 Demo ${index + 1}/4: "${query}"`);
    console.log('─'.repeat(60));
    
    try {
      // Use mock planner instead of real OpenAI
      const mockPlanner = new MockTUIPlanner();
      
      // This would normally call tuiQuery, but we'll simulate it
      console.log('🔄 Processing with mock AI planner...');
      
      const result = await tuiQuery(sampleEmployeeData, query, {
        includePerformance: true,
        validateUI: true,
        sampleDocuments: 3
      });

      // Show the results
      console.log('✅ Query completed successfully!');
      console.log(`📊 Results: ${result.results.length} items`);
      
      if (result.performance) {
        console.log(`⚡ Performance: ${result.performance.totalMs}ms total`);
      }

      if (result.validation) {
        console.log(`🎨 UI Validation: ${result.validation.valid ? '✅ Valid' : '❌ Invalid'}`);
        if (result.validation.errors.length > 0) {
          console.log('   Errors:', result.validation.errors);
        }
      }

      // Show sample results
      if (result.results.length > 0) {
        console.log('📋 Sample Results:');
        console.log(JSON.stringify(result.results.slice(0, 2), null, 2));
      }

      console.log(`🎨 UI Title: "${result.plan.uiSpec.title}"`);
      console.log(`🖼️  UI Layout: ${result.plan.uiSpec.layout.type} (${result.plan.uiSpec.layout.id})`);

    } catch (error) {
      console.error('❌ Demo failed:', error instanceof Error ? error.message : error);
    }
  }

  console.log('\n🎉 Mock Demo Complete!');
  console.log('💡 To use with real OpenAI: set OPENAI_API_KEY and use tuiQuery() or CLI with --tui');
}

// Handle CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runMockDemo().catch(console.error);
}

export { runMockDemo, MockTUIPlanner, sampleEmployeeData };