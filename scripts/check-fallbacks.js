#!/usr/bin/env node

/**
 * Fallback and Placeholder Detection Script
 * 
 * This script scans TypeScript files for common patterns that indicate
 * incomplete implementations, fallbacks, or placeholder code that could
 * mask real functionality and cause false test results.
 * 
 * Based on feedback from TomNeyland identifying that fallback methods
 * were masking real performance issues by returning unchanged data.
 */

import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const projectRoot = join(__dirname, '..');

// Problematic patterns that indicate incomplete implementations
const FALLBACK_PATTERNS = [
  // Direct fallback indicators
  /\/\/.*fallback.*for now/i,
  /\/\*.*fallback.*for now.*\*\//i,
  /\/\/.*simplified.*for now/i,
  /\/\*.*simplified.*for now.*\*\//i,
  
  // TODO patterns that suggest incomplete work
  /\/\/.*TODO.*implement/i,
  /\/\*.*TODO.*implement.*\*\//i,
  
  // Methods that return unchanged data (red flag for fallbacks)
  /return\s+collection;.*\/\/.*fallback/i,
  /return\s+obj;.*\/\/.*fallback/i,
  /return\s+doc;.*\/\/.*fallback/i,
  
  // Stub method patterns
  /function.*\{[\s\n]*\/\/.*stub/i,
  /\=\>\s*\{[\s\n]*\/\/.*stub/i,
  
  // Disabled functionality comments
  /\/\/.*disabled.*avoid.*compatibility/i,
  /\/\*.*disabled.*avoid.*compatibility.*\*\//i,
  
  // Methods that unconditionally return false/true (potential stubs)
  /function.*\{[\s\n]*\/\/.*disable/i,
  /return\s+false;.*\/\/.*disable/i,
  
  // Common stub implementations
  /\/\/.*would need more sophisticated/i,
  /\/\/.*this would be replaced with/i,
  /\/\/.*for now, just return/i,
  
  // Unused parameter patterns with underscore prefixes (often indicates stubs)
  /_[a-zA-Z]+.*:.*any.*\/\/.*unused/i,
  
  // Emergency bypass patterns
  /\/\/.*emergency.*bypass/i,
  /\/\/.*quick.*fix/i,
];

// More specific patterns for method signatures that are likely stubs
const STUB_METHOD_PATTERNS = [
  // Methods with unused parameters that just return input
  /private\s+\w+\([^)]*_\w+[^)]*\).*\{[\s\n]*return\s+\w+;/,
  
  // Methods that always return false with complex parameters
  /\w+\([^)]*\):\s*boolean\s*\{[\s\n]*\/\/.*disable[\s\S]*?return\s+false;/,
  
  // Methods that just return unchanged input with TODO comments
  /\w+\([^)]*\)[\s\S]*?\{[\s\n]*\/\/.*TODO[\s\S]*?return\s+\w+;/,
];

async function scanForFallbacks() {
  console.log('🔍 Scanning for fallback and placeholder implementations...\n');

  // Find all TypeScript files in src/
  const tsFiles = await glob('src/**/*.ts', { cwd: projectRoot });
  
  let totalIssues = 0;
  const issuesByFile = new Map();

  for (const file of tsFiles) {
    const fullPath = join(projectRoot, file);
    const relativePath = relative(projectRoot, fullPath);
    
    try {
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const issues = [];

      // Check each line for fallback patterns
      lines.forEach((line, lineNumber) => {
        const lineNum = lineNumber + 1;
        
        // Check standard patterns
        FALLBACK_PATTERNS.forEach((pattern, patternIndex) => {
          if (pattern.test(line)) {
            issues.push({
              line: lineNum,
              content: line.trim(),
              type: 'fallback_comment',
              pattern: patternIndex
            });
          }
        });
      });

      // Check for stub method patterns in the entire file
      STUB_METHOD_PATTERNS.forEach((pattern, patternIndex) => {
        const matches = content.match(pattern);
        if (matches) {
          // Find the line number of the match
          const matchIndex = content.indexOf(matches[0]);
          const lineNum = content.substring(0, matchIndex).split('\n').length;
          
          issues.push({
            line: lineNum,
            content: matches[0].substring(0, 80) + (matches[0].length > 80 ? '...' : ''),
            type: 'stub_method',
            pattern: patternIndex
          });
        }
      });

      // Look for methods that unconditionally return false (potential stubs)
      const methodReturnFalsePattern = /(function|method)[\s\S]*?\{[\s\n]*return\s+false;\s*\}/gi;
      let match;
      while ((match = methodReturnFalsePattern.exec(content)) !== null) {
        const matchIndex = match.index;
        const lineNum = content.substring(0, matchIndex).split('\n').length;
        
        // Only flag if it looks suspicious (has parameters but returns false)
        if (match[0].includes('(') && match[0].includes(':')) {
          issues.push({
            line: lineNum,
            content: match[0].substring(0, 80) + (match[0].length > 80 ? '...' : ''),
            type: 'suspicious_false_return',
            pattern: -1
          });
        }
      }

      if (issues.length > 0) {
        issuesByFile.set(relativePath, issues);
        totalIssues += issues.length;
      }

    } catch (error) {
      console.error(`❌ Error reading file ${relativePath}: ${error.message}`);
      totalIssues++;
    }
  }

  // Report results
  if (totalIssues === 0) {
    console.log('✅ No fallback or placeholder implementations detected!');
    console.log('   All code appears to have complete, functional implementations.');
    return true;
  } else {
    console.log(`❌ Found ${totalIssues} potential fallback/placeholder issues:\n`);
    
    for (const [file, issues] of issuesByFile) {
      console.log(`📁 ${file}:`);
      
      issues.forEach(issue => {
        const typeLabel = {
          'fallback_comment': '🔄 Fallback Comment',
          'stub_method': '🚧 Stub Method', 
          'suspicious_false_return': '⚠️  Suspicious Return'
        }[issue.type] || '❓ Unknown';
        
        console.log(`   ${typeLabel} (line ${issue.line}): ${issue.content}`);
      });
      console.log('');
    }
    
    console.log('💡 These patterns suggest incomplete implementations that could:');
    console.log('   • Mask performance issues by bypassing real logic');
    console.log('   • Cause tests to pass when functionality is broken');
    console.log('   • Hide optimization failures behind fallback code');
    console.log('');
    console.log('🔧 Please implement complete functionality or remove these features.');
    
    return false;
  }
}

// Run the check
scanForFallbacks().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Fallback check failed:', error);
  process.exit(1);
});