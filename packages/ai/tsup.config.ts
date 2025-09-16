import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'openai-client': 'src/openai-client.ts',
      'schema-inference': 'src/schema-inference.ts',
      'spinner': 'src/spinner.ts',
      'tui': 'src/tui.tsx',
      'planner/tui-planner': 'src/planner/tui-planner.ts',
      'compiler/index': 'src/compiler/index.tsx',
      'runtime/data-binding': 'src/runtime/data-binding.ts',
      'runtime/theme': 'src/runtime/theme.ts',
      'specs/Plan': 'src/specs/Plan.ts',
      'renderers/table': 'src/renderers/table.tsx',
      'renderers/list': 'src/renderers/list.tsx',
      'renderers/stat': 'src/renderers/stat.tsx',
      'renderers/json': 'src/renderers/json.tsx',
      'renderers/sparkline': 'src/renderers/sparkline.tsx',
      'renderers/grid': 'src/renderers/grid.tsx'
    },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    clean: true,
    dts: false,  // Disable for now due to TS errors
    bundle: false,  // Don't bundle dependencies for library
    splitting: false,
    treeshake: true,
    external: ['aggo', 'openai', 'commander', 'react', 'ink', 'ink-table', 'ink-select-input', 'ink-text-input', 'chalk', 'zod'],  // Mark peer/external deps
    onSuccess: 'cp src/planner/prompt.md dist/planner/', // Copy prompt file
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    clean: false,
    dts: false,
    bundle: true,  // Bundle CLI dependencies
    splitting: false,
    treeshake: true,
    external: ['aggo'],  // Keep aggo external since it's a peer dep
  },
]);