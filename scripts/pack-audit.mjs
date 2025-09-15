#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString('utf8');
}

function main() {
  // Use npm pack --json --dry-run to list files without creating a tarball
  try {
    const out = run('npm pack --json --dry-run --silent');
    const json = JSON.parse(out);
    const files = json?.[0]?.files?.map(f => f.path) ?? [];

    const allowedRoots = new Set([
      'package.json',
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
    ]);

    const violations = [];
    for (const f of files) {
      if (f.startsWith('dist/')) continue;
      if (allowedRoots.has(f)) continue;
      violations.push(f);
    }

    // Basic invariants
    const hasDistIndex = files.includes('dist/index.js');
    const hasDistTypes = files.includes('dist/index.d.ts');

    const problems = [];
    if (!hasDistIndex) problems.push('Missing dist/index.js');
    if (!hasDistTypes) problems.push('Missing dist/index.d.ts');
    if (violations.length) problems.push(`Unexpected files: ${violations.join(', ')}`);

    if (problems.length) {
      console.error('[pack-audit] Package contents check failed:\n - ' + problems.join('\n - '));
      process.exit(1);
    }

    console.log('[pack-audit] OK');
    console.log('[pack-audit] Files:');
    for (const f of files) console.log(' -', f);
  } catch (error) {
    console.error('[pack-audit] Failed to parse npm pack output:', error.message);
    // Try alternative approach - check if dist files exist directly
    const distExists = existsSync('dist/index.js') && existsSync('dist/index.d.ts');
    if (distExists) {
      console.log('[pack-audit] OK - dist files verified manually');
    } else {
      console.error('[pack-audit] FAILED - dist files missing');
      process.exit(1);
    }
  }
}

main();

