/**
 * Playwright config for the Next.js example's browser suite.
 *
 * The suite runs against the repo's real dev topology: `next dev`
 * (`_dev:next`, port 44326) and the `zdtp-server` apply sidecar
 * (`_dev:tokens-bin`, port 24684), the same two scripts `pnpm dev` composes.
 * `next dev` is the only setup where the dev-only `/api/dev/apply` route
 * exists, so it is the only one where Apply writes files. Each is its own
 * webServer entry, so Playwright waits on both and fails the run if either
 * one does not come up. `tests/e2e/global-setup.ts` then proves the listeners
 * are this checkout's (sidecar writeRoot/routing, API-route wiring).
 *
 * `reuseExistingServer` only off CI: a local `pnpm dev` you keep running is
 * adopted (and identity-checked by global setup); on CI a run either owns its
 * servers or fails loudly on an occupied port.
 *
 * `workers: 1` + no parallelism: the apply spec rewrites
 * `src/styles/tokens.css` on disk, and every spec shares one dev server.
 */

import { defineConfig, devices } from '@playwright/test';
import { ORIGIN, SIDECAR_ORIGIN } from './tests/e2e/origins';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'html',
  timeout: isCI ? 60 * 1000 : 30 * 1000,
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm run _dev:next',
      url: `${ORIGIN}/`,
      reuseExistingServer: !isCI,
      timeout: 120 * 1000,
    },
    {
      command: 'pnpm run _dev:tokens-bin',
      url: `${SIDECAR_ORIGIN}/healthz`,
      reuseExistingServer: !isCI,
      timeout: 60 * 1000,
    },
  ],
});
