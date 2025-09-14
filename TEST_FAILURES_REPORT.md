# Test Failures Report

This report documents failures from running each Mocha spec individually with a 60s per-test timeout and `--exit`. Each spec was executed as:

- Command: `./node_modules/.bin/mocha --import=tsx/esm --exit --timeout 60000 <file>`
- Logs: one file per spec under `.modash-test-logs/`

## Overview

- Total specs: 18
- Passed: 12
- Failed: 6

Failed specs:

- `tests/aggregation.spec.js`
- `tests/phase3-optimization.spec.js`
- `tests/streaming-comparison.spec.js`
- `tests/streaming-removal.spec.js`
- `tests/streaming.spec.js`
- `tests/transparent-streaming.spec.js`

Detailed logs are available in `.modash-test-logs/<spec>.log`.

## Failures By Type

### AssertionError

- `tests/aggregation.spec.js`
  - Case: `$group` distinct items ordering
  - Symptom: Expected group IDs order differs (e.g., expected `abc, jkl, xyz` vs actual `xyz, jkl, abc`).
  - Hypothesis: Non-deterministic group output ordering; lack of stable sort in `$group` results. Consider explicit `$sort` in pipelines or enforcing deterministic ordering when comparing results.
  - Log excerpt: see `.modash-test-logs/aggregation.spec.js.log` (lines around tests at 167, 194).

- `tests/aggregation.spec.js`
  - Case: Pivot books grouped by authors
  - Symptom: Same items but different ordering of grouped documents in result.
  - Hypothesis: Same as above; ordering differences after `$group`/accumulator stages.

- `tests/streaming-comparison.spec.js`
  - Case: `$group` equivalence (streaming vs non-streaming)
  - Symptom: Differences in grouped outputs and aggregates (missing/extra category groups in streaming path).
  - Hypothesis: Streaming aggregator state handling diverges from non-streaming baseline; possible issues with how group keys are created/normalized or with accumulator updates during streaming updates.
  - Log: `.modash-test-logs/streaming-comparison.spec.js.log` (around line 367 in test file).

- `tests/streaming-comparison.spec.js`
  - Case: Live update correctness
  - Symptom: Non-streaming expected empty array; streaming produced a group `{ _id: [undefined], count: 5, totalQty: 1230 }`.
  - Hypothesis: Group key serialization for single-field keys uses tuple/array form (e.g., `[undefined]`) instead of scalar `undefined`, creating spurious groups. Alternatively, streaming path includes docs with missing key where baseline filters them out.

- `tests/streaming-removal.spec.js`
  - Case: Mixed add/remove operations – aggregate values
  - Symptom: `avgScore` mismatch (expected 85, got 100); count mismatch in complex scenario (expected 2, got 1).
  - Hypothesis: Aggregator decrement logic on removal is incorrect (e.g., count/total not updated symmetrically), or group membership not updated after removals.
  - Log: `.modash-test-logs/streaming-removal.spec.js.log` (around lines 320 and 378 in test file).

- `tests/streaming.spec.js`
  - Case: Event source restart
  - Symptom: Expected event count 5, actual 4.
  - Hypothesis: Restart logic fails to re-subscribe all consumers or misses an event during stop/start transitions.

- `tests/transparent-streaming.spec.js`
  - Case: Equivalence between transparent streaming and non-streaming
  - Symptom: Extra `_id: [undefined]` present in streaming results versus baseline.
  - Hypothesis: Same key normalization issue as above; single-field group keys represented as arrays in streaming path.

### Mocha Test Timeout

- `tests/phase3-optimization.spec.js`
  - Case: Streaming performance – high-throughput delta operations
  - Symptom: `Error: Timeout of 60000ms exceeded.`
  - Hypothesis: Backpressure or batching pathway does not flush/settle within 60s; async test awaits a condition that never completes due to missed notifications or stalled worker/IVM update loop.
  - Log: `.modash-test-logs/phase3-optimization.spec.js.log`.

- `tests/streaming.spec.js`
  - Case: Memory management – rapid event bursts
  - Symptom: `Error: Timeout of 60000ms exceeded.`
  - Hypothesis: Event burst handler leaks or fails to process all events; test awaits stabilization that doesn’t occur under current thresholds.

## Potential Root Causes (Grouped)

- Ordering differences (group results): `$group` emits non-deterministic order; tests expect deterministic arrays. Enforce ordering or add post-`$group` `$sort` for comparisons.
- Group key normalization: Streaming path uses array/tuple for single-field keys (e.g., `_id: [undefined]`), diverging from scalar key behavior in baseline. Normalize to scalar when only one key is present; ensure undefined/null keys match baseline semantics.
- Streaming accumulator updates: Inconsistent updates on remove/add sequences cause incorrect `count`, `avg`, etc. Verify decrement/increment logic and state snapshots per group.
- Live update/stale state: Missing event bridging on restart leads to lost events; verify subscription teardown/start ordering and idempotent re-registration.
- High-throughput/backpressure: Batching or debounce layers do not settle under load; ensure flush points and completion signaling for tests that await stability.

## Per-Spec Summaries

- `aggregation.spec.js`: 8 passing, 2 failing (AssertionError – ordering/grouping).
- `phase3-optimization.spec.js`: 9 passing, 1 failing (Mocha timeout – high-throughput streaming test).
- `streaming-comparison.spec.js`: 9 passing, 4 failing (AssertionError – group equivalence and live update correctness including `_id: [undefined]`).
- `streaming-removal.spec.js`: 18 passing, 2 failing (AssertionError – inconsistent aggregates after removals).
- `streaming.spec.js`: 38 passing, 2 failing (AssertionError – event count; Mocha timeout – rapid bursts).
- `transparent-streaming.spec.js`: 4 passing, 1 failing (AssertionError – `_id: [undefined]` present).

## Artifacts

- Logs: `.modash-test-logs/*.log`
- Quick summary: `.modash-test-logs/summary.txt`

No code changes were made; this report only documents observed failures and likely root causes based on log analysis.
