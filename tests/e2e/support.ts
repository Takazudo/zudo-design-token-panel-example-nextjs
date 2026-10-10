/**
 * Shared constants, the error-gated `test` fixture, and panel helpers for the
 * Next.js example's browser suite.
 *
 * Every spec imports `test` / `expect` from here, not from `@playwright/test`,
 * so the auto `diagnostics` fixture runs on every page of every test: any
 * console error, uncaught page error, failed request, or HTTP >= 400 response
 * on any visited route fails that test.
 *
 * Each test gets a fresh browser context, so no panel state (localStorage /
 * sessionStorage) leaks between tests.
 */

import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORIGIN, SIDECAR_ORIGIN } from './origins';

export { expect };

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TOKENS_PATH = resolve(REPO_ROOT, 'src', 'styles', 'tokens.css');

export { ORIGIN, SIDECAR_ORIGIN };
export const HOME_TITLE = 'Next.js Example — Design Token Panel';

// The panel derives its root id from `storagePrefix` in src/config/panel-config.ts.
export const STORAGE_PREFIX = 'next-example-tokens';
export const PANEL_ROOT_ID = `${STORAGE_PREFIX}-root`;

/**
 * Under `next dev`, Chromium intermittently reports an App Router navigation
 * fetch (`RSC: 1`, `?_rsc=`) as `net::ERR_ABORTED` (CDP `canceled: true`) at
 * the very end of a 200 response whose payload already arrived in full and
 * rendered the route. No page script cancels it (no AbortController.abort or
 * stream cancel runs), it reproduces with the panel closed, and every spec
 * still asserts the destination rendered. Only that exact shape is exempt: an
 * RSC request that got a 200 response and then ended ERR_ABORTED. Any other
 * failure — a non-200 or missing response, another error, a non-RSC request —
 * still fails the test.
 */
function isCanceledAfterRscPayload(
  headers: Record<string, string>,
  errorText: string | undefined,
  status: number | undefined,
): boolean {
  return headers.rsc === '1' && errorText === 'net::ERR_ABORTED' && status === 200;
}

export const test = base.extend<{ diagnostics: string[] }>({
  diagnostics: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          problems.push(`console.error: ${message.text()} (${message.location().url})`);
        }
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      const pending: Promise<void>[] = [];
      page.on('requestfailed', (request) => {
        const errorText = request.failure()?.errorText;
        const describe = (status: number | undefined) =>
          `requestfailed: ${request.method()} ${request.url()} [${request.resourceType()}]` +
          ` — ${errorText} (response status: ${status ?? 'none'})`;
        pending.push(
          request.response().then((response) => {
            if (isCanceledAfterRscPayload(request.headers(), errorText, response?.status())) return;
            problems.push(describe(response?.status()));
          }),
        );
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          problems.push(`HTTP ${response.status()}: ${response.request().method()} ${response.url()}`);
        }
      });
      await use(problems);
      await Promise.all(pending);
      expect(problems, 'console errors, page errors and failed requests').toEqual([]);
    },
    { auto: true },
  ],
});

/** Route paths as the App Router serves them (`trailingSlash: true` in next.config.ts). */
export function routeUrl(path: string): string {
  return path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}/`;
}

export function panelShell(page: Page): Locator {
  return page.locator('.tokenpanel-shell');
}

/**
 * The host's own trigger in the AppShell topbar, not the console API. Scoped
 * to the banner because the prose page renders a second copy in its body.
 *
 * The button calls `window.nx.toggleDesignPanel()`, which PanelBootstrap's
 * effect installs once the root layout has hydrated; a click before that
 * silently does nothing, so wait for the handler first.
 */
export async function toggleViaHeader(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { nx?: { toggleDesignPanel?: unknown } }).nx
        ?.toggleDesignPanel === 'function',
  );
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Open Design Token Panel', exact: true })
    .click();
}

export async function openViaHeader(page: Page): Promise<void> {
  await expect(panelShell(page)).toHaveCount(0);
  await toggleViaHeader(page);
  await expect(panelShell(page)).toBeVisible();
}

export async function closeViaHeader(page: Page): Promise<void> {
  await expect(panelShell(page)).toBeVisible();
  await toggleViaHeader(page);
  await expect(panelShell(page)).toHaveCount(0);
}

/** App Router soft navigation through the sidenav's `next/link`s (never `page.goto`). */
export async function navigateViaSidenav(page: Page, label: string, path: string): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: label, exact: true }).click();
  await expect(page).toHaveURL(routeUrl(path));
  await expect(nav.locator('.nx-sidenav-link.is-active')).toHaveText(label);
}

/**
 * Exactly one panel instance: one panel root, one set of the panel's
 * document-level mounts, one injected stylesheet, and at most one shell.
 */
export async function expectSinglePanelInstance(page: Page, shellCount: 0 | 1): Promise<void> {
  await expect(page.locator(`[id="${PANEL_ROOT_ID}"]`)).toHaveCount(1);
  for (const mount of ['highlight', 'elpath', 'element-inspect', 'domtweaker']) {
    await expect(page.locator(`[id="tokenpanel-${mount}-mount"]`)).toHaveCount(1);
  }
  // The stylesheet the panel self-injects on first mount (PORTABLE-CONTRACT §4.1.4).
  await expect(page.locator('style#zudo-design-token-panel-styles')).toHaveCount(1);
  await expect(panelShell(page)).toHaveCount(shellCount);
}

/**
 * Header actions collapse behind the "Panel actions" kebab when the shell is
 * narrower than the header's container query (zdtp recipe "Reaching header
 * actions", id-based pattern).
 */
export async function clickHeaderAction(
  page: Page,
  id: 'export' | 'import' | 'apply' | 'reset',
): Promise<void> {
  const shell = panelShell(page);
  const action = shell.locator(`[data-zdtp-action="${id}"]:visible`);
  if ((await action.count()) === 0) {
    await shell.getByRole('button', { name: 'Panel actions', exact: true }).click();
  }
  await action.click();
}

/**
 * Opens a panel tab and fills a length token's numeric input. The input is
 * targeted by its own accessible name (`<cssVar> value`) and role, so the
 * row's bulk-select checkbox (`Select <label>`) can never match.
 */
export async function setLengthToken(
  page: Page,
  tab: RegExp,
  cssVar: string,
  numericValue: string,
): Promise<void> {
  await panelShell(page).getByRole('tab', { name: tab }).click();
  const input = panelShell(page).getByRole('textbox', { name: `${cssVar} value`, exact: true });
  await input.fill(numericValue);
  await input.press('Tab');
}

export function rootTokenValue(page: Page, cssVar: string): Promise<string> {
  return page.evaluate(
    (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    cssVar,
  );
}
