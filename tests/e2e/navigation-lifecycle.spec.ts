/**
 * App Router soft navigation + panel ownership/lifecycle.
 *
 * Soft-navigation proof: a `window.__marker` set before navigating survives
 * every sidenav `next/link` click and browser back/forward. A full document
 * load would drop it, so `page.goto` is never used between routes here. Every
 * route in this app — including the MDX prose page — is an App Router route,
 * so every sidenav hop is a client-side swap.
 *
 * Lifecycle: the panel is opened/closed only through the host's topbar
 * trigger, and after every navigation and toggle the page holds exactly one
 * panel root (plus one set of the panel's document-level mounts) — the root
 * layout's PanelBootstrap mounts it once, outside the React tree, and route
 * changes must neither drop nor duplicate it.
 */

import type { Page } from '@playwright/test';
import {
  closeViaHeader,
  expect,
  expectSinglePanelInstance,
  navigateViaSidenav,
  openViaHeader,
  panelShell,
  routeUrl,
  setLengthToken,
  test,
  toggleViaHeader,
} from './support';

const ROUTES = [
  { label: 'About', path: '/about' },
  { label: 'Prose', path: '/prose' },
  { label: 'Forms', path: '/components/forms' },
  { label: 'Status', path: '/components/status' },
  { label: 'Widgets', path: '/components/widgets' },
  { label: 'Data', path: '/components/data' },
  { label: 'Home', path: '/' },
] as const;

const HOME_HEADING = 'Live token tweaking, in plain Next.js + React';
const ABOUT_HEADING = 'About this example';
const FORMS_HEADING = 'Form controls demo';

type MarkedWindow = Window & { __marker?: number };

async function setMarker(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as MarkedWindow).__marker = 1;
  });
}

async function expectSameDocument(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as MarkedWindow).__marker)).toBe(1);
}

const pageTitle = (page: Page) => page.locator('.nx-page-title');

test('sidenav navigation and back/forward are soft swaps that keep one open panel', async ({
  page,
}) => {
  await page.goto('/');
  await openViaHeader(page);
  await setMarker(page);

  await navigateViaSidenav(page, 'About', '/about');
  await expect(pageTitle(page)).toHaveText(ABOUT_HEADING);
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);
  await expect(panelShell(page)).toBeVisible();

  await navigateViaSidenav(page, 'Forms', '/components/forms');
  await expect(pageTitle(page)).toHaveText(FORMS_HEADING);
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goBack();
  await expect(page).toHaveURL(routeUrl('/about'));
  await expect(pageTitle(page)).toHaveText(ABOUT_HEADING);
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goBack();
  await expect(page).toHaveURL(routeUrl('/'));
  await expect(pageTitle(page)).toHaveText(HOME_HEADING);
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);

  await page.goForward();
  await expect(page).toHaveURL(routeUrl('/about'));
  await expect(pageTitle(page)).toHaveText(ABOUT_HEADING);
  await expectSameDocument(page);
  await expectSinglePanelInstance(page, 1);
  await expect(panelShell(page)).toBeVisible();
});

test('repeated open/close across navigation never duplicates the panel', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  await setMarker(page);

  for (let round = 0; round < 2; round += 1) {
    for (const { label, path } of ROUTES) {
      await navigateViaSidenav(page, label, path);
      await expectSinglePanelInstance(page, 1);
      await closeViaHeader(page);
      await expectSinglePanelInstance(page, 0);
      await openViaHeader(page);
      await expectSinglePanelInstance(page, 1);
    }
  }
  await expectSameDocument(page);
});

test('panel visibility persists across navigation and reload', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);

  await page.reload();
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);

  await closeViaHeader(page);
  await navigateViaSidenav(page, 'About', '/about');
  await expectSinglePanelInstance(page, 0);

  await page.reload();
  await expect(pageTitle(page)).toHaveText(ABOUT_HEADING);
  await expectSinglePanelInstance(page, 0);

  await toggleViaHeader(page);
  await expect(panelShell(page)).toBeVisible();
  await navigateViaSidenav(page, 'Home', '/');
  await expect(panelShell(page)).toBeVisible();
  await expectSinglePanelInstance(page, 1);
});

test('a token edit persists across soft navigation, back/forward and reload', async ({ page }) => {
  await page.goto('/');
  await openViaHeader(page);
  await expect(pageTitle(page)).toHaveCSS('font-size', '28px');

  await setLengthToken(page, /^font$/i, '--nx-scale-xl', '2.5');
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');

  await setMarker(page);
  await navigateViaSidenav(page, 'About', '/about');
  await expect(pageTitle(page)).toHaveText(ABOUT_HEADING);
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
  await page.goBack();
  await expect(pageTitle(page)).toHaveText(HOME_HEADING);
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
  await expectSameDocument(page);

  await page.reload();
  await expect(pageTitle(page)).toHaveCSS('font-size', '40px');
  await expectSinglePanelInstance(page, 1);
});
