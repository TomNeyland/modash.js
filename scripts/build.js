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

// Simple bundling - just copy and create a single file
const indexPath = resolve(rootDir, 'src/modash/index.js');
const indexContent = readFileSync(indexPath, 'utf8');

// Create a simple bundle (for now just the main file)
const bundleContent = `// Modash.js - Modern MongoDB-inspired aggregation library
// This is a simple build for compatibility
${indexContent}`;

writeFileSync(resolve(distDir, 'modash.js'), bundleContent);

console.log('Build complete! Generated dist/modash.js');