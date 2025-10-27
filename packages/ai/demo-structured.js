#!/usr/bin/env node

/**
 * Demo of the complete Structured Output + UIDSL system
 * 
 * This script demonstrates the full NL → Mongo Pipeline + Pretty TUI workflow
 * without requiring an actual OpenAI API key (uses mock responses)
 */

import { parseUIDSL } from './src/uidsl/parser.js';
import { compileUIDSL } from './src/uidsl/compiler.js';
import { executePipelineString } from './src/engine/run_pipeline.js';
import { Plan } from './src/plan.zod.js';

// Sample data for demonstration
const sampleData = [
  { _id: 1, name: 'Alice Johnson', score: 95, category: 'Premium', department: 'Engineering', salary: 120000, date: '2024-01-15' },
  { _id: 2, name: 'Bob Smith', score: 87, category: 'Standard', department: 'Marketing', salary: 85000, date: '2024-01-16' },
  { _id: 3, name: 'Charlie Brown', score: 92, category: 'Premium', department: 'Engineering', salary: 115000, date: '2024-01-17' },
  { _id: 4, name: 'Diana Wilson', score: 78, category: 'Standard', department: 'Sales', salary: 75000, date: '2024-01-18' },
  { _id: 5, name: 'Eve Davis', score: 94, category: 'Premium', department: 'Engineering', salary: 125000, date: '2024-01-19' },
  { _id: 6, name: 'Frank Miller', score: 83, category: 'Standard', department: 'Marketing', salary: 80000, date: '2024-01-20' },
  { _id: 7, name: 'Grace Lee', score: 88, category: 'Standard', department: 'Sales', salary: 78000, date: '2024-01-21' },
  { _id: 8, name: 'Henry Taylor', score: 91, category: 'Premium', department: 'Engineering', salary: 118000, date: '2024-01-22' }
];

// Mock structured plans that demonstrate different UI components
const demoPlans = [
  {
    name: "Top Performers Table",
    query: "top 5 employees by score",
    plan: {
      v: "v1",
      q: '[{"$sort": {"score": -1}}, {"$limit": 5}, {"$project": {"name": 1, "score": 1, "department": 1}}]',
      ui: 'ui:v1;t(f=$,c=Name:$.name|Score:$.score:r|Department:$.department,s=$.score:desc,pg=5)',
      w: { mode: 'b' }
    }
  },
  {
    name: "Department Statistics",
    query: "average salary by department",
    plan: {
      v: "v1", 
      q: '[{"$group": {"_id": "$department", "avgSalary": {"$avg": "$salary"}, "count": {"$sum": 1}}}, {"$sort": {"avgSalary": -1}}]',
      ui: 'ui:v1;g(dr=R,gp=2)[t(f=$,c=Department:$._id|Average:$.avgSalary:r|Count:$.count:r,s=$.avgSalary:desc),st(lb=Total Employees,v=$.count)]'
    }
  },
  {
    name: "Category Breakdown",
    query: "count employees by category",  
    plan: {
      v: "v1",
      q: '[{"$group": {"_id": "$category", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]',
      ui: 'ui:v1;br(f=$,lb=Category,v=$.count,u=employees,x=Category,y=Count)'
    }
  },
  {
    name: "JSON Data View",
    query: "show all employee data",
    plan: {
      v: "v1",
      q: '[{"$project": {"name": 1, "score": 1, "category": 1, "department": 1}}]',
      ui: 'ui:v1;js(f=$,st=json)'
    }
  }
];

async function runDemo() {
  console.log('🚀 Aggo Structured Output + UIDSL Demo');
  console.log('=' .repeat(50));
  console.log();
  
  console.log(`📊 Sample Data: ${sampleData.length} employee records`);
  console.log('👥 Fields: name, score, category, department, salary, date');
  console.log();

  for (const demo of demoPlans) {
    console.log(`\n🎯 Demo: ${demo.name}`);
    console.log(`💬 Query: "${demo.query}"`);
    console.log('─'.repeat(60));
    
    try {
      // 1. Validate the plan structure
      const planValidation = Plan.safeParse(demo.plan);
      if (!planValidation.success) {
        console.error('❌ Plan validation failed:', planValidation.error);
        continue;
      }
      console.log('✅ Plan structure validated');
      
      // 2. Execute the MongoDB pipeline
      console.log(`🔄 Executing pipeline: ${demo.plan.q.slice(0, 50)}...`);
      const execResult = await executePipelineString(demo.plan.q, sampleData);
      
      if (!execResult.success) {
        console.error('❌ Pipeline execution failed:', execResult.error?.message);
        continue;
      }
      
      console.log(`✅ Pipeline executed successfully (${execResult.results?.length} results)`);
      console.log(`⏱️  Performance: ${execResult.performance?.totalMs}ms`);
      
      // 3. Parse the UIDSL
      console.log(`🎨 Parsing UIDSL: ${demo.plan.ui}`);
      const uiAst = parseUIDSL(demo.plan.ui);
      console.log(`✅ UIDSL parsed (component: ${uiAst.root.type})`);
      
      // 4. Show the results in a readable format
      console.log('\n📋 Results:');
      console.log('─'.repeat(40));
      
      if (execResult.results && execResult.results.length > 0) {
        // Simple table-like output for demonstration
        if (demo.name.includes('Table') || demo.name.includes('Statistics')) {
          execResult.results.slice(0, 5).forEach((item, index) => {
            console.log(`${index + 1}. ${JSON.stringify(item)}`);
          });
        } else if (demo.name.includes('JSON')) {
          console.log(JSON.stringify(execResult.results.slice(0, 3), null, 2));
        } else {
          execResult.results.forEach((item, index) => {
            console.log(`• ${JSON.stringify(item)}`);
          });
        }
      }
      
      // 5. Show UIDSL component info
      console.log('\n🎨 UI Component Info:');
      console.log(`   Type: ${uiAst.root.type}`);
      console.log(`   Props: ${Object.keys(uiAst.root.props).join(', ')}`);
      if (uiAst.root.children) {
        console.log(`   Children: ${uiAst.root.children.length} components`);
      }
      
    } catch (error) {
      console.error('❌ Demo failed:', error.message);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ Demo completed!');
  console.log();
  console.log('🎯 What was demonstrated:');
  console.log('  • Zod schema validation for structured LLM output');
  console.log('  • MongoDB pipeline execution from JSON strings');
  console.log('  • UIDSL parsing for multiple component types');
  console.log('  • Complete NL → Pipeline + UI workflow');
  console.log('  • Error handling and performance tracking');
  console.log();
  console.log('🚀 Ready for production use with OpenAI API!');
  console.log('💡 Try: npx aggo-ai "your query" --tui');
}

// Run the demo
runDemo().catch(error => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});