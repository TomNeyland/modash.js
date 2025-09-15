#!/usr/bin/env node

/**
 * Husky v9 hook installer
 * 
 * This script ensures that git hooks are properly installed for Husky v9.
 * It replaces the deprecated `husky install` command functionality.
 */

const fs = require('fs');
const path = require('path');

const hooksDirPath = path.join('.git', 'hooks');
const huskyDirPath = '.husky';

// Check if we're in a git repository
if (!fs.existsSync('.git')) {
  console.log('Not in a git repository, skipping hook installation.');
  process.exit(0);
}

// Check if we're in CI environment
if (process.env.CI === 'true' || process.env.HUSKY === '0') {
  console.log('CI environment detected or HUSKY=0 set, skipping hook installation.');
  process.exit(0);
}

// Create the husky.sh script that git hooks will use
const huskySh = `#!/bin/sh
if [ -z "$HUSKY_SKIP" ]; then
  debug () {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky (debug) - $1"
    fi
  }

  readonly hook_name="$(basename "$0")"
  debug "starting $hook_name..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ".husky/$hook_name" ]; then
    debug "running .husky/$hook_name"
    ".husky/$hook_name"
  fi
fi
`;

// Ensure hooks directory exists
if (!fs.existsSync(hooksDirPath)) {
  fs.mkdirSync(hooksDirPath, { recursive: true });
}

// Create the _/husky.sh file
const huskyShPath = path.join(hooksDirPath, '_');
if (!fs.existsSync(huskyShPath)) {
  fs.mkdirSync(huskyShPath, { recursive: true });
}
fs.writeFileSync(path.join(huskyShPath, 'husky.sh'), huskySh, { mode: 0o755 });

// Install hooks for each file in .husky directory
if (fs.existsSync(huskyDirPath)) {
  const huskyFiles = fs.readdirSync(huskyDirPath);
  
  huskyFiles.forEach(file => {
    const huskyFilePath = path.join(huskyDirPath, file);
    const stat = fs.statSync(huskyFilePath);
    
    if (stat.isFile() && file !== '.gitignore') {
      const hookPath = path.join(hooksDirPath, file);
      const hookContent = `. "${path.join('$(dirname "$0")', '_', 'husky.sh')}"`;
      
      fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
      console.log(`✅ Installed ${file} hook`);
    }
  });
  
  console.log('🎉 Husky hooks installed successfully!');
} else {
  console.log('No .husky directory found, skipping hook installation.');
}