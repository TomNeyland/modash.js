---
'aggo': major
'aggo-ai': major
'aggo-rxjs': major
---

## 🎉 Introducing Aggo (formerly modash.js)

This is a major release that renames the package from `modash` to `aggo`. The functionality remains the same, but the package has been rebranded for better npm availability and a cleaner name.

### Breaking Changes

- Package renamed from `modash` to `aggo`
- CLI command changed from `modash` to `aggo`
- Import statements need to be updated:
  - `import Modash from 'modash'` → `import Aggo from 'aggo'`
  - `import { createStreamingCollection } from 'modash'` → `import { createStreamingCollection } from 'aggo'`
- Plugin packages renamed:
  - `@modash/plugin-ai` → `aggo-ai`
  - `@modash/rxjs` → `aggo-rxjs`

### Migration Guide

1. Uninstall old package: `npm uninstall modash`
2. Install new package: `npm install aggo`
3. Update all imports to use `aggo` instead of `modash`
4. Update CLI scripts to use `aggo` command instead of `modash`

All functionality remains identical - this is purely a naming change.
