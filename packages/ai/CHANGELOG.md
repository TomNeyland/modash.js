# aggo-ai

## 1.0.0

### Major Changes

- 10fd54c: BREAKING: Monorepo restructure and release pipeline changes
  - Migrate to pnpm workspaces and align release tooling. This changes the package publishing layout so all packages are released from `packages/*`.
  - Root package is now private; consumers should depend on `aggo` as usual, but the published artifact originates from `packages/aggo`.
  - Internal package relationships are updated to workspace-aware configs.

  Other improvements:
  - Migrate CI to pnpm workspaces to fix installs and caching, ensuring Actions pass reliably.
  - Align release pipeline with Changesets and pnpm for consistent versioning and publishing.
  - Continue migration of core package layout toward `packages/aggo` to simplify multi-package development.
  - Documentation and configuration cleanups to match the new structure.

  If you pin exact versions, update to ^1.0.0 for all packages.

## 0.1.2

### Patch Changes

- 2cc28d8: Fix package.json to remove workspace protocol references for npm compatibility

## 0.1.1

### Patch Changes

- 66255e9: Initial release preparation for aggo workspace packages
