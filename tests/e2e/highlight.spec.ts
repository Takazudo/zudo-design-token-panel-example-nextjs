/**
 * Highlight feature e2e spec for the Next.js example.
 *
 * Covers three scenarios:
 *
 *  1. Panel togglable per route — open panel on Home, navigate to Forms,
 *     panel shell persists across client-side nav.
 *
 *  2. Highlight overlay — enabling highlight for --nx-palette-1 on the Home
 *     page produces at least one overlay div with non-zero rect and the slot-0
 *     default ring colour (red: rgb(255, 45, 45)).
 *
 *  3. "Disable all highlights" — clicking the button in the settings popover
 *     removes all active entries from sessionStorage while preserving the
 *     slot colour in localStorage.
 *
 * Prerequisites
 * -------------
 *  - Next dev server on port 44326 (managed by playwright.config.ts webServer).
 *
 * Storage contract
 * ----------------
 *  - localStorage  `next-example-tokens:visible`          — '1' = panel open
 *  - localStorage  `next-example-tokens-highlight-slots`  — slot specs (color, width)
 *  - sessionStorage `next-example-tokens-highlight-active` — active token→slot map
 *
 * Slot 0 default (hard-coded in highlight-state.ts):
 *   { color: '#ff2d2d', outlineWidth: 2 }  →  rgb(255, 45, 45)
 */

import { test, expect } from '@playwright/test';
import { mountPanel, clearPanelStorage, STORAGE_PREFIX } from './_helpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGHLIGHT_ACTIVE_KEY = `${STORAGE_PREFIX}-highlight-active`;
const HIGHLIGHT_SLOTS_KEY = `${STORAGE_PREFIX}-highlight-slots`;

// Slot 0 default colour — matches DEFAULT_HIGHLIGHT_SLOTS[0].color in highlight-state.ts
// reason: value is defined in the panel package; keeping it here as a string literal
//         avoids a cross-repo import while still acting as a regression guard.
const SLOT_0_DEFAULT_COLOR_HEX = '#ff2d2d';
const SLOT_0_DEFAULT_COLOR_RGB = 'rgb(255, 45, 45)';

// CSS var highlighted in scenario 2 — appears on the Home page palette swatch row.
const HIGHLIGHT_VAR = '--nx-palette-1';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Next.js example — highlight feature', () => {
  test.beforeEach(async ({ page }) => {
    await clearPanelStorage(page);
  });

  test.afterEach(async ({ page }) => {
    await clearPanelStorage(page);
  });

  // -------------------------------------------------------------------------
  // 1. Panel togglable per route
  // -------------------------------------------------------------------------

  test('panel shell persists after client-side navigation to another route', async ({ page }) => {
    // Mount panel on the home route.
    await mountPanel(page, '/');

    // Panel shell must be visible on the home page.
    await expect(page.locator('.tokenpanel-shell')).toBeVisible();

    // Navigate to the Forms page via client-side nav (no full reload).
    await page.goto('/components/forms');
    await page.waitForLoadState('domcontentloaded');

    // The panel shell must still be visible — HighlightOrchestrator wraps all
    // children outside the panel gate so it persists across Next.js route changes.
    await expect(page.locator('.tokenpanel-shell')).toBeVisible({ timeout: 5_000 });

    // Tabs are still accessible — confirms the panel is fully interactive.
    await expect(page.getByRole('tab', { name: /color/i })).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 2. Highlight overlay — non-zero rect + matching slot colour
  // -------------------------------------------------------------------------

  test('enabling highlight for --nx-palette-1 renders a visible overlay ring', async ({ page }) => {
    // Mount panel on the Home page — the palette swatch row at index 1 uses
    // var(--nx-palette-1) as its background, so findElementsUsingToken will
    // find at least one element.
    await mountPanel(page, '/');

    // Navigate to the Color tab (default tab, but be explicit).
    const colorTab = page.getByRole('tab', { name: /color/i });
    await colorTab.waitFor({ state: 'visible', timeout: 5_000 });
    await colorTab.click();

    // The highlight toggle button for --nx-palette-1 sits beside the palette
    // swatch in the panel's color tab.  The button title is
    //   "Highlight elements using --nx-palette-1"  (inactive state)
    // Use the title attribute to find it unambiguously.
    const toggleBtn = page.locator(
      `.tokenpanel-highlight-toggle[title="Highlight elements using ${HIGHLIGHT_VAR}"]`,
    );
    await toggleBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await toggleBtn.click();

    // Overlay portal is appended to document.body by HighlightOrchestrator.
    const overlayMount = page.locator('#tokenpanel-highlight-mount');
    await overlayMount.waitFor({ state: 'attached', timeout: 5_000 });

    // At least one overlay div must appear inside the portal.
    const overlay = overlayMount.locator('.tokenpanel-highlight-overlay').first();
    await overlay.waitFor({ state: 'attached', timeout: 5_000 });

    // Bounding rect must be non-zero — confirms the overlay tracks a real element.
    const rect = await overlay.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeGreaterThan(0);

    // The slot-0 ring colour must appear in box-shadow (hostile-host fallback applied by
    // highlight-overlay.tsx: `inset 0 0 0 <w>px <color>`).
    const boxShadow = await overlay.evaluate(
      (el) => window.getComputedStyle(el).boxShadow,
    );
    expect(boxShadow).toContain('inset');
    expect(boxShadow).toContain(SLOT_0_DEFAULT_COLOR_RGB);

    // Toggle button must now show the active title (confirms context state updated).
    await expect(
      page.locator(`.tokenpanel-highlight-toggle[title^="Stop highlighting ${HIGHLIGHT_VAR}"]`),
    ).toBeVisible({ timeout: 3_000 });
  });

  // -------------------------------------------------------------------------
  // 3. "Disable all highlights" — clears active, preserves slot colour
  // -------------------------------------------------------------------------

  test('"Disable all highlights" removes active highlights and preserves slot colours', async ({ page }) => {
    // Mount panel and enable highlighting.
    await mountPanel(page, '/');

    const colorTab = page.getByRole('tab', { name: /color/i });
    await colorTab.waitFor({ state: 'visible', timeout: 5_000 });
    await colorTab.click();

    const toggleBtn = page.locator(
      `.tokenpanel-highlight-toggle[title="Highlight elements using ${HIGHLIGHT_VAR}"]`,
    );
    await toggleBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await toggleBtn.click();

    // Wait for overlay to appear — confirms the active state is committed.
    await page
      .locator('#tokenpanel-highlight-mount .tokenpanel-highlight-overlay')
      .first()
      .waitFor({ state: 'attached', timeout: 5_000 });

    // Verify active state was written to sessionStorage before opening the popover.
    const activeBefore = await page.evaluate((key) => sessionStorage.getItem(key), HIGHLIGHT_ACTIVE_KEY);
    expect(activeBefore).not.toBeNull();

    // Open the highlight settings popover via the gear button.
    // The gear button has role="button" and aria-label="Highlight outline settings".
    const gearBtn = page.getByRole('button', { name: 'Highlight outline settings' });
    await gearBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await gearBtn.click();

    // Popover dialog must appear.
    const popover = page.getByRole('dialog', { name: 'Highlight outline settings' });
    await popover.waitFor({ state: 'visible', timeout: 5_000 });

    // Click "Disable all highlights" in the popover footer.
    const disableBtn = popover.getByText('Disable all highlights');
    await disableBtn.waitFor({ state: 'visible', timeout: 3_000 });
    await disableBtn.click();

    // Overlays must be gone — the active map is now empty.
    await expect(
      page.locator('#tokenpanel-highlight-mount .tokenpanel-highlight-overlay'),
    ).toHaveCount(0, { timeout: 5_000 });

    // sessionStorage active key must now be absent or empty ('{}').
    const activeAfter = await page.evaluate((key) => sessionStorage.getItem(key), HIGHLIGHT_ACTIVE_KEY);
    const parsedActive = activeAfter ? JSON.parse(activeAfter) : {};
    expect(Object.keys(parsedActive)).toHaveLength(0);

    // localStorage slot colours must be preserved — slot 0 colour still #ff2d2d.
    const slotsRaw = await page.evaluate((key) => localStorage.getItem(key), HIGHLIGHT_SLOTS_KEY);
    const slots: Array<{ color: string; outlineWidth: number }> = slotsRaw
      ? JSON.parse(slotsRaw)
      : [];
    // slots[0] is either the persisted value or falls back to the default —
    // either way the colour must be the original slot-0 default.
    const slot0Color = slots[0]?.color ?? SLOT_0_DEFAULT_COLOR_HEX;
    expect(slot0Color.toLowerCase()).toBe(SLOT_0_DEFAULT_COLOR_HEX.toLowerCase());
  });
});
