#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const TEST_DIR = 'tests';
const LOG_DIR = '.aggo-test-logs';
const TIMEOUT_MS = 60_000; // 1 minute wall clock
const mochaBin = join('.', 'node_modules', '.bin', 'mocha');

function listSpecs() {
  const files = readdirSync(TEST_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.spec.js'))
    .map((e) => join(TEST_DIR, e.name))
    .sort();
  return files;
}

function ensureDirs() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
}

function runOne(spec) {
  return new Promise((resolve) => {
    const logName = basename(spec) + '.log';
    const logPath = join(LOG_DIR, logName);
    const outChunks = [];

    const args = [
      '--import=tsx/esm',
      '--exit',
      '--timeout',
      String(TIMEOUT_MS),
      spec,
    ];

    const child = spawn(mochaBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => outChunks.push(d));
    child.stderr.on('data', (d) => outChunks.push(d));

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      const output = Buffer.concat(outChunks).toString('utf8');
      writeFileSync(logPath, output, 'utf8');
      const status = timedOut
        ? 'TIMEOUT'
        : code === 0
        ? 'PASSED'
        : 'FAILED';
      resolve({ spec, status, code, signal, logPath, output });
    });
  });
}

function classify(output, status) {
  const types = new Set();
  const details = [];
  if (status === 'TIMEOUT') {
    types.add('Wall timeout exceeded');
    details.push('Process killed after 60s without completing.');
    return { types: [...types], details };
  }
  // Mocha timeout
  if (/Timeout of \d+ms exceeded|exceed.*timeout/i.test(output)) {
    types.add('Mocha test timeout');
  }
  if (/AssertionError/i.test(output)) types.add('AssertionError');
  if (/TypeError:/i.test(output)) types.add('TypeError');
  if (/ReferenceError:/i.test(output)) types.add('ReferenceError');
  if (/SyntaxError:/i.test(output)) types.add('SyntaxError');
  if (/(UnhandledPromiseRejection|unhandled rejection)/i.test(output)) types.add('UnhandledPromiseRejection');
  if (/EADDRINUSE|address already in use/i.test(output)) types.add('Port in use');
  if (/out of memory/i.test(output)) types.add('OutOfMemory');

  // Extract first few failing lines as details
  const failBlocks = output.split(/\n\s*\d+\) /).slice(1).map((s) => s.split('\n').slice(0, 5).join('\n'));
  details.push(...failBlocks.slice(0, 5));
  return { types: [...types], details };
}

function potentialRootCauses(type) {
  switch (type) {
    case 'AssertionError':
      return 'Behavior mismatch with expectations; check operator semantics and edge cases.';
    case 'TypeError':
      return 'Unexpected null/undefined or wrong type passed into operator or helper.';
    case 'ReferenceError':
      return 'Missing import/export or renamed symbol; verify module boundaries.';
    case 'SyntaxError':
      return 'Transpilation/loader issue with ESM/TSX or invalid JS syntax.';
    case 'UnhandledPromiseRejection':
      return 'Async path throwing without catch; ensure promises are awaited/handled.';
    case 'Mocha test timeout':
      return 'Async test never resolves; potential hanging stream or missing done/await.';
    case 'Wall timeout exceeded':
      return 'Spec process hung or event loop blocked; potential infinite loop or deadlock.';
    case 'Port in use':
      return 'Tests share a network port across runs; isolate or randomize ports.';
    case 'OutOfMemory':
      return 'Data set too large or memory leak in pipeline/operators.';
    default:
      return 'Unknown; inspect logs for stack traces.';
  }
}

async function main() {
  ensureDirs();
  const specs = listSpecs();
  const results = [];
  for (const spec of specs) {
    process.stderr.write(`Running ${spec}\n`);
    const r = await runOne(spec);
    results.push(r);
  }

  const summary = [];
  const byType = new Map();
  for (const r of results) {
    const { types, details } = classify(r.output, r.status);
    summary.push({
      file: r.spec,
      status: r.status,
      exitCode: r.code,
      types,
      log: r.logPath,
      details,
    });
    for (const t of types.length ? types : ['Unknown']) {
      byType.set(t, (byType.get(t) || 0) + 1);
    }
  }

  // Write machine-readable JSON and a quick summary for later markdown generation
  writeFileSync(join(LOG_DIR, 'results.json'), JSON.stringify({ results: summary, byType: Object.fromEntries(byType) }, null, 2));

  // Also write a plain-text summary for quick inspection
  const lines = [];
  for (const s of summary) {
    lines.push(`${s.status.padEnd(7)} ${basename(s.file)}  types=[${s.types.join(', ') || 'None'}]  log=${s.log}`);
  }
  writeFileSync(join(LOG_DIR, 'summary.txt'), lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

