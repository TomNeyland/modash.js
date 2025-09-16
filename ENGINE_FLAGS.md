#!/usr/bin/env markdown

# Engine Flags and Environment Toggles

This document lists the supported environment variables (“engine flags”), what they do, their defaults, and where they’re observed in the codebase. These flags are intended for local testing, diagnostics, and controlled enablement of in‑progress features.

How to set flags

- Unix/macOS: `FLAG=VALUE node your-script.js`
- Cross‑platform (npm scripts): use the provided scripts in `package.json` or a tool like `cross-env` when needed.

Conventions

- Boolean flags generally use `'1'` or `'0'`, or the literal string `'true'` for some older debug switches.
- Unless specified, unspecified flags take their default behavior.

## Columnar IVM and Hot‑Path Routing

- `AGGO_ENABLE_COLUMNAR_GROUP`
  - Default: off (unset)
  - Values: `'1'` to enable planner selection of `HashGroupExec` in explain/plan; falling back at runtime until the group kernel lands.
  - Effect: Controls whether the columnar planner will consider `$group` for the columnar path. When off, explain will show `FallbackGroup` with `reasonCode: FEATURE_OFF`.
  - Used in: `src/aggo/hot-path-aggregation.ts`, `src/aggo/api-enhancements.ts`

- `AGGO_ENABLE_COLUMNAR_UNWIND`
  - Default: on (unset)
  - Values: `'0'` to disable columnar unwind.
  - Effect: When set to `'0'`, forces `$unwind` to fallback; explain will show `FallbackUnwind` with `reasonCode: FEATURE_OFF`.
  - Used in: `src/aggo/hot-path-aggregation.ts`, `src/aggo/api-enhancements.ts`

- Columnar routing reason codes (not flags, but surfaced when columnar is skipped):
  - `COLUMNAR_SMALL_DATASET`: dataset below columnar threshold
  - `COLUMNAR_FEATURE_OFF`: stage disabled by flags (e.g., group/unwind)
  - `COLUMNAR_NOT_IMPLEMENTED`: stage not implemented for columnar path
  - Emitted via: `recordOptimizerRejection()` in `src/aggo/hot-path-aggregation.ts`

## Streaming / Hot‑Path Controls

- `HOT_PATH_STREAMING`
  - Default: on (unset)
  - Values: `'0'` to disable, any other value has no effect.
  - Effect: When `'0'`, disables hot‑path computation for initial materialization and recompute in streaming collections; falls back to standard aggregate.
  - Used in: `src/aggo/streaming.ts`

- `DISABLE_HOT_PATH_STREAMING`
  - Default: off (unset)
  - Values: `'1'` to force disable.
  - Effect: Equivalent to `HOT_PATH_STREAMING='0'`; an explicit kill‑switch for the hot path in streaming.
  - Used in: `src/aggo/streaming.ts`

## Debug / Diagnostics Flags

- `DEBUG_IVM`
  - Default: off
  - Values: `'1'`, `'true'`
  - Effect: Enables extra logging, invariant checks, and tracing in IVM and hot‑path engines (e.g., row ID state transitions, buffer bounds checks).
  - Used in: many modules, including `src/aggo/zero-alloc-engine.ts`, `src/aggo/crossfilter-engine.ts`, `src/aggo/crossfilter-operators.ts`

- `DEBUG_IVM_MISMATCH`
  - Default: off
  - Values: `'1'`
  - Effect: On streaming initial materialization, computes both IVM and hot‑path results to check for semantic parity; logs diffs if they diverge.
  - Used in: `src/aggo/streaming.ts`

- `DEBUG_GROUP_KEYS`
  - Default: off
  - Values: `'1'`
  - Effect: Emits group key diagnostics in crossfilter operators.
  - Used in: `src/aggo/crossfilter-operators.ts`

- `DEBUG_UNWIND`
  - Default: off
  - Values: any truthy string (presence checked)
  - Effect: Emits additional logs for `$unwind` behavior and edge cases.
  - Used in: `src/aggo/aggregation.ts`, `src/aggo/hot-path-aggregation.ts`

- `DEBUG` (derived)
  - The internal `DEBUG` constant is truthy when `process.env.NODE_ENV !== 'production'`. Primarily influences whether detailed optimizer logs are emitted.
  - Defined in: `src/aggo/debug.ts`

## CI / Hooks / Test Environment

- `CI`
  - Default: off
  - Values: `'true'`
  - Effect: Skips pre‑commit hook installation and some local behaviors in `scripts/install-hooks.cjs`.

- `HUSKY`
  - Default: unset
  - Values: `'0'` to disable git hook installation.

- `NODE_ENV`
  - Common values: `'test'`, `'production'`
  - Effect: Used by `src/aggo/debug.ts` and some tests to tweak verbosity; not an engine feature flag per se.

## Current Operator Coverage Summary (Columnar)

- Columnar path implemented:
  - `$match` → ColumnarMatchExec
  - `$project` → ColumnarProjectExec
  - `$unwind` → ColumnarUnwindExec (can be disabled via `AGGO_ENABLE_COLUMNAR_UNWIND='0'`)
  - `$limit` → ColumnarLimitExec

- Fallback path:
  - `$group` → FallbackGroup (until `AGGO_ENABLE_COLUMNAR_GROUP='1'` + HashGroupExec lands)
  - `$sort` → FallbackSort (Top‑K rewrite candidate when followed by `$limit`, actual Top‑K kernel is Phase 10)

- Explain/plan visibility:
  - `explain(pipeline).physicalPlan` lists the chosen operator per stage and reasonCode when falling back.

## Examples

- Force streaming to use standard aggregate (no hot path):
  - `DISABLE_HOT_PATH_STREAMING=1 node your-script.js`
  - or `HOT_PATH_STREAMING=0 node your-script.js`

- Enable extra IVM debugging and invariant checks:
  - `DEBUG_IVM=1 node tests/debug/test_unwind_debug.mjs`

- Show columnar operator selection in explain and keep `$group` off:
  - `node --import=tsx/esm scripts/explain-demo.mjs`

- Opt‑in to columnar `$group` selection in the planner (development only):
  - `AGGO_ENABLE_COLUMNAR_GROUP=1 node --import=tsx/esm scripts/explain-demo.mjs`
  - Note: Execution may still fall back until HashGroupExec is implemented.

## Notes

- Flags are intentionally conservative by default. Columnar `$group` is gated off until the hash aggregation kernel and accumulator coverage are finalized.
- `$sort` remains fallback unless fused with `$limit` to a Top‑K operator (Phase 10 deliverable).
- Debug flags can affect performance; avoid enabling in benchmarks unless specifically testing diagnostics.
