/**
 * "Change a token in the panel → a visible element's computed style updates."
 *
 * One representative consumer per token category, each edited through the
 * panel UI (no direct `:root` writes, no Apply — the file on disk is never
 * touched):
 *   - font scale  `--nx-scale-md`   → `.nx-subsection-title` font-size on
 *                 /components/forms
 *                 (via `--nx-text-subsection-title: var(--nx-scale-md)`)
 *   - spacing     `--nx-vsp-md`     → `.nx-stat-card` padding-top on
 *                 /components/data
 *   - color       `--nx-palette-1`  → palette swatch #1 background on /
 *
 * Each test gets a fresh browser context, so no panel state leaks between
 * tests.
 */

import { expect, openViaHeader, panelShell, routeUrl, setLengthToken, test } from './support';

test('font scale: --nx-scale-md resizes the subsection titles', async ({ page }) => {
  await page.goto(routeUrl('/components/forms'));
  await openViaHeader(page);
  const title = page.locator('.nx-subsection-title').first();
  await expect(title).toHaveCSS('font-size', '18px');

  await setLengthToken(page, /^font$/i, '--nx-scale-md', '1.5');

  await expect(title).toHaveCSS('font-size', '24px');
});

test('spacing: --nx-vsp-md changes stat card padding', async ({ page }) => {
  await page.goto(routeUrl('/components/data'));
  await openViaHeader(page);
  const card = page.locator('.nx-stat-card').first();
  await expect(card).toHaveCSS('padding-top', '16px');

  await setLengthToken(page, /^spacing$/i, '--nx-vsp-md', '3');

  await expect(card).toHaveCSS('padding-top', '48px');
});

test('color: --nx-palette-1 repaints palette swatch #1', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  const swatch = page.locator('.nx-swatch').nth(1);
  await expect(swatch).toHaveCSS('background-color', 'rgb(45, 108, 223)');

  const shell = panelShell(page);
  await shell.getByRole('tab', { name: /^color$/i }).click();
  await shell.locator('[aria-label^="--nx-palette-1:"]').click();
  const hexInput = page.locator('.tokenpanel-color-picker-hex-input');
  await hexInput.fill('#ff0000');
  await hexInput.press('Enter');

  await expect(swatch).toHaveCSS('background-color', 'rgb(255, 0, 0)');
});
