import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  clean: true,
  dts: false,  // Disable for now due to TS errors
  bundle: false,  // Don't bundle dependencies for library
  splitting: false,
  treeshake: true,
  external: ['aggo', 'rxjs'],  // Mark peer deps as external
});