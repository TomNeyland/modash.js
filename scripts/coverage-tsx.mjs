#!/usr/bin/env node

/**
 * Enhanced coverage runner for TypeScript with tsx
 * Addresses tsx + c8 interaction issues by using Node.js native coverage
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

console.log('🎯 Enhanced TypeScript Coverage Runner');
console.log('⚡ Using Node.js native V8 coverage for better tsx compatibility\n');

// Clean and ensure coverage directory exists
if (existsSync('./coverage')) {
  rmSync('./coverage', { recursive: true, force: true });
}
mkdirSync('./coverage', { recursive: true });

const args = [
  '--import=tsx/esm',
  'node_modules/.bin/mocha',
  '--exit',
  '--recursive',
  'tests/'
];

console.log(`Running: NODE_V8_COVERAGE=./coverage node ${args.join(' ')}\n`);

const child = spawn('node', args, {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    NODE_V8_COVERAGE: './coverage',
    NODE_OPTIONS: '--max-old-space-size=4096'
  }
});

child.on('close', (code) => {
  console.log(`\n📊 Tests completed with exit code: ${code}`);
  
  if (code === 0) {
    console.log('✅ All tests passed!');
    console.log('📁 V8 coverage data saved to ./coverage directory');
    console.log('💡 Use c8 to generate reports from this data: npx c8 report');
  } else {
    console.log('❌ Tests failed');
  }
  
  process.exit(code);
});

child.on('error', (err) => {
  console.error('❌ Error running tests:', err);
  process.exit(1);
});