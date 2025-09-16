import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    treeshake: true,
    platform: 'node',
    minify: false,
    splitting: false,
    bundle: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    target: 'es2020',
    treeshake: true,
    platform: 'node',
    minify: false,
    splitting: false,
    bundle: true,
  }
])
