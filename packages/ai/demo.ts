#!/usr/bin/env tsx

/**
 * Demo script for @modash/plugin-ai
 * Shows schema inference and pipeline generation (without OpenAI API calls)
 */

import {
  getSchema,
  getSampleDocuments,
  formatSchema,
  formatSamples,
} from './src/index.js';

// Sample data for demonstration
const sampleData = [
  {
    id: 1,
    name: 'Alice Johnson',
    age: 30,
    department: 'Engineering',
    salary: 95000,
    active: true,
    skills: ['JavaScript', 'TypeScript', 'React'],
    address: { city: 'Seattle', state: 'WA', zip: 98101 },
  },
  {
    id: 2,
    name: 'Bob Smith',
    age: 25,
    department: 'Marketing',
    salary: 75000,
    active: true,
    skills: ['SEO', 'Analytics', 'Social Media'],
    address: { city: 'Portland', state: 'OR', zip: 97201 },
  },
  {
    id: 3,
    name: 'Carol Davis',
    age: 35,
    department: 'Engineering',
    salary: 110000,
    active: false,
    skills: ['Python', 'Machine Learning', 'SQL'],
    address: { city: 'San Francisco', state: 'CA', zip: 94102 },
  },
  {
    id: 4,
    name: 'David Wilson',
    age: 28,
    department: 'Sales',
    salary: 82000,
    active: true,
    skills: ['CRM', 'Communication', 'Negotiation'],
    address: { city: 'Austin', state: 'TX', zip: 78701 },
  },
  {
    id: 5,
    name: 'Eve Brown',
    age: 32,
    department: 'Marketing',
    salary: 88000,
    active: true,
    skills: ['Content Marketing', 'Brand Management'],
    address: { city: 'Denver', state: 'CO', zip: 80202 },
  },
];

console.log('🤖 @modash/plugin-ai Demo');
console.log('═'.repeat(50));

console.log('\n📊 Sample Data:');
console.log(`Loaded ${sampleData.length} employee records`);

console.log('\n🔍 Schema Inference:');
console.log('━'.repeat(30));
const schema = getSchema(sampleData);
console.log(formatSchema(schema));

console.log('\n📋 Sample Documents:');
console.log('━'.repeat(30));
const samples = getSampleDocuments(sampleData, 2);
console.log(formatSamples(samples));

console.log('\n💡 Example Natural Language Queries:');
console.log('━'.repeat(40));
const exampleQueries = [
  'average salary by department',
  'count active employees',
  'top 3 highest paid employees',
  'employees in Engineering department',
  'average age of active employees',
  'total salary cost by state',
];

exampleQueries.forEach((query, index) => {
  console.log(`${index + 1}. "${query}"`);
});

console.log('\n🚀 Usage Example:');
console.log('━'.repeat(20));
console.log('# With OpenAI API key:');
console.log('export OPENAI_API_KEY="your-key-here"');
console.log('');
console.log('# Schema only:');
console.log('cat employees.jsonl | npx modash-ai --schema-only');
console.log('');
console.log('# Natural language query:');
console.log(
  'cat employees.jsonl | npx modash-ai "average salary by department"'
);
console.log('');
console.log('# Show generated pipeline:');
console.log(
  'npx modash-ai "top 5 by salary" --file employees.jsonl --show-pipeline'
);

console.log('\n✨ Demo completed successfully!');
console.log('Note: Actual OpenAI integration requires a valid API key.');
