/**
 * Shared helpers for the Next.js example e2e specs.
 *
 * Extracted so multiple spec files can share constants and panel-mounting
 * logic without duplicating the seeding pattern.
 */

import type { Page } from '@playwright/test';
import { READABLE_STATE_KEY_SUFFIXES } from '@takazudo/zdtp/constants';

// ---------------------------------------------------------------------------
// Storage constants
// ---------------------------------------------------------------------------

export const STORAGE_PREFIX = 'next-example-tokens';
export const STORAGE_KEY_VISIBLE = `${STORAGE_PREFIX}:visible`;

/**
 * Every state-envelope version the installed package can still read. Taken
 * from the package registry rather than hard-coded: 0.5.1 writes `-state-v3`,
 * so a helper pinned to `-state-v2` would silently stop clearing overrides
 * (and stale payloads then trip the eager-load gate in src/lib/mount-panel.ts,
 * leaking state between specs).
 */
export const STORAGE_KEYS_STATE = Object.values(READABLE_STATE_KEY_SUFFIXES).map(
  (suffix) => `${STORAGE_PREFIX}${suffix}`,
);

// ---------------------------------------------------------------------------
// Route table (extracted from routes-smoke.spec.ts)
// ---------------------------------------------------------------------------

/**
 * Routes with a standard .nx-page-title heading.
 * Prose is handled separately because it renders a semantic <h1> (MDX).
 */
export const PAGE_TITLE_ROUTES = [
  { label: 'Home',    path: '/',                      heading: /live token tweaking/i        },
  { label: 'Forms',   path: '/components/forms',      heading: /form controls/i              },
  { label: 'Status',  path: '/components/status',     heading: /status/i                     },
  { label: 'Widgets', path: '/components/widgets',    heading: /interactive widgets/i        },
  { label: 'Data',    path: '/components/data',       heading: /data.*demo|data components/i },
] as const;

// ---------------------------------------------------------------------------
// Panel mount helper
// ---------------------------------------------------------------------------

/**
 * Seeds the panel's visibility flag in localStorage and reloads so the host
 * adapter eagerly mounts the panel before first paint.
 *
 * The canonical truthy value is '1' — matches what `src/index.tsx` writes.
 * Visits `path` (default: '/'), seeds the flag, then reloads and waits for
 * the panel shell to appear on screen.
 */
export async function mountPanel(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((key) => {
    localStorage.setItem(key, '1');
  }, STORAGE_KEY_VISIBLE);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  // Wait for the panel shell to be visible — proves the mount hook fired.
  await page.locator('.tokenpanel-shell').waitFor({ state: 'visible', timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Panel state cleanup helper
// ---------------------------------------------------------------------------

/**
 * Clears all panel-related storage keys so each spec starts from a clean state.
 *
 * Navigates to '/' first if needed so localStorage is accessible (calling
 * page.evaluate on the initial blank page throws a SecurityError).
 *
 * Clears:
 *   - localStorage: visible flag, every readable state envelope (token
 *     overrides), highlight-slots
 *   - sessionStorage: highlight-active
 */
export async function clearPanelStorage(page: Page): Promise<void> {
  // Ensure we're on an actual page — localStorage is not accessible from the
  // initial blank page ('about:blank') that Playwright opens per test.
  const url = page.url();
  if (!url || url === 'about:blank' || url === '') {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  }
  await page.evaluate(
    ({ prefix, stateKeys }) => {
      localStorage.removeItem(`${prefix}:visible`);
      for (const key of stateKeys) localStorage.removeItem(key);
      localStorage.removeItem(`${prefix}-highlight-slots`);
      sessionStorage.removeItem(`${prefix}-highlight-active`);
    },
    { prefix: STORAGE_PREFIX, stateKeys: STORAGE_KEYS_STATE },
  );
}
