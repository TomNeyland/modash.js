import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    clean: true,
    // Emit public type declarations for consumers
    dts: true,
    bundle: true,
    splitting: false,
    skipNodeModulesBundle: true,
    treeshake: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    clean: false,
    dts: false,
    bundle: true,
    splitting: false,
    skipNodeModulesBundle: true,
    treeshake: true,
    // Preserve the shebang from src/cli.ts
    // esbuild (used by tsup) preserves the first-line shebang automatically
  },
  // Public types bundle (no JS consumption needed)
  // Types are generated from real source; we don't maintain a separate types entry
]);
