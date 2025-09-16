import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'openai-client': 'src/openai-client.ts',
      'schema-inference': 'src/schema-inference.ts',
      'spinner': 'src/spinner.ts'
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
    external: ['aggo', 'openai', 'commander'],  // Mark peer/external deps
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