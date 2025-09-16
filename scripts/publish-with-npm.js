#!/usr/bin/env node

/**
 * Force changesets to use npm for publishing
 * This works around the issue where changesets detects pnpm from lockfile
 */

import { execSync } from 'child_process';

// Set environment to force npm usage
process.env.npm_config_user_agent = 'npm/10.0.0 node/v20.0.0 linux x64';

// Run changeset publish with npm
try {
  execSync('npx changeset publish --no-git-tag', {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Force npm as package manager
      npm_config_user_agent: 'npm/10.0.0 node/v20.0.0 linux x64'
    }
  });
} catch (error) {
  console.error('Failed to publish packages:', error.message);
  process.exit(1);
}