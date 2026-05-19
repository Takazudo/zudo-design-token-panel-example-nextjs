#!/usr/bin/env node
/**
 * setup-upstream.mjs
 *
 * Bootstrap script for local development. Clones (or updates) the
 * zudo-design-token-panel sibling repo at the pinned SHA, builds it,
 * then installs this consumer's own dependencies.
 *
 * Usage:
 *   pnpm setup:upstream
 *
 * The pinned SHA is read from .github/workflows/deploy.yml (the single
 * source of truth) so there is no duplication to maintain.
 *
 * IMPORTANT: run `pnpm setup:upstream` on a fresh checkout BEFORE
 * `pnpm install` — `pnpm install` alone will fail because the
 * `file:../zudo-design-token-panel/packages/zudo-design-token-panel`
 * sibling does not yet exist.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Read pinned SHA from deploy.yml
// ---------------------------------------------------------------------------

const DEPLOY_YML = resolve(ROOT, '.github', 'workflows', 'deploy.yml');
const deployYmlContent = readFileSync(DEPLOY_YML, 'utf-8');
const shaMatch = deployYmlContent.match(/PANEL_PINNED_SHA:\s*([0-9a-f]{40})/);
if (!shaMatch) {
  console.error('[setup-upstream] ERROR: Could not find PANEL_PINNED_SHA in .github/workflows/deploy.yml');
  process.exit(1);
}
const PANEL_SHA = shaMatch[1];
console.error(`[setup-upstream] Panel pinned SHA: ${PANEL_SHA}`);

// ---------------------------------------------------------------------------
// Sibling paths
// ---------------------------------------------------------------------------

const PANEL_SIBLING = resolve(ROOT, '..', 'zudo-design-token-panel');
const PANEL_REPO_URL = 'https://github.com/Takazudo/zudo-design-token-panel.git';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  console.error(`[setup-upstream] $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

// ---------------------------------------------------------------------------
// Ensure sibling is present at pinned SHA
// ---------------------------------------------------------------------------

if (!existsSync(PANEL_SIBLING)) {
  console.error('[setup-upstream] Sibling not found — cloning...');
  run(`git clone ${PANEL_REPO_URL} "${PANEL_SIBLING}"`);
  run(`git -C "${PANEL_SIBLING}" checkout ${PANEL_SHA}`);
} else {
  // Check for dirty working tree in sibling
  try {
    const status = execSync(`git -C "${PANEL_SIBLING}" status --porcelain`, { encoding: 'utf-8' });
    if (status.trim().length > 0) {
      console.error('[setup-upstream] ERROR: Sibling repo has uncommitted changes.');
      console.error('[setup-upstream] Refusing to checkout a different SHA over a dirty tree.');
      console.error('[setup-upstream] If you are working on the panel in dev, see /dev-wip-package-upstream-wt-dev.');
      process.exit(1);
    }
  } catch {
    // git status failed — proceed cautiously
  }

  console.error('[setup-upstream] Sibling exists — fetching and checking out pinned SHA...');
  run(`git -C "${PANEL_SIBLING}" fetch`);
  run(`git -C "${PANEL_SIBLING}" checkout ${PANEL_SHA}`);
}

// ---------------------------------------------------------------------------
// Build the panel package so dist/ is present
// ---------------------------------------------------------------------------

console.error('[setup-upstream] Installing panel workspace deps...');
run('pnpm install --frozen-lockfile', { cwd: PANEL_SIBLING });

console.error('[setup-upstream] Building panel package...');
run('pnpm -F @takazudo/zudo-design-token-panel build', { cwd: PANEL_SIBLING });

// ---------------------------------------------------------------------------
// Install this consumer's own dependencies
// ---------------------------------------------------------------------------

console.error('[setup-upstream] Installing consumer deps...');
run('pnpm install', { cwd: ROOT });

// ---------------------------------------------------------------------------
// Verify build
// ---------------------------------------------------------------------------

console.error('[setup-upstream] Running pnpm build to verify...');
run('pnpm build', { cwd: ROOT });

console.error('[setup-upstream] Done. Run `pnpm dev` to start the dev server.');
