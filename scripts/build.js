#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

// Create dist directory if it doesn't exist
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// For now, create a simple shim that re-exports from the source
const shimContent = `// Modash.js - Modern MongoDB-inspired aggregation library
// Distribution build - re-exports from source

export { 
  default,
  aggregate,
  count,
  $expression,
  $group,
  $project,
  $match,
  $limit,
  $skip,
  $sort,
  $unwind,
  $lookup,
  $addFields,
  $set,
} from '../src/modash/index.js';
`;

writeFileSync(resolve(distDir, 'modash.js'), shimContent);
writeFileSync(resolve(distDir, 'index.js'), shimContent);

console.log('Build complete! Generated dist/modash.js and dist/index.js');

writeFileSync(resolve(distDir, 'modash.js'), shimContent);
writeFileSync(resolve(distDir, 'index.js'), shimContent);

console.log('Build complete! Generated dist/modash.js and dist/index.js');