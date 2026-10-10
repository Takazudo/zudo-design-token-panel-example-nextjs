/**
 * Proves the suite talks to THIS repo's Next dev server + sidecar before any
 * spec runs, then compiles every route once.
 *
 * Playwright's webServer only waits for the two URLs to answer, and with
 * `reuseExistingServer` (local runs) it adopts whatever already listens on
 * those ports. So this checks identity:
 *   - the sidecar's /healthz reports this checkout as writeRoot and
 *     scaffold.routing.json as its routing file;
 *   - the Next server serves this example's home page;
 *   - the dev-only API route (app/api/dev/apply/route.dev.ts) forwards to that
 *     sidecar: a dry run must come back with the sidecar's own envelope naming
 *     src/styles/tokens.css (the route answers 502 when the sidecar is
 *     unreachable). A dry run never writes.
 * Any mismatch throws, which fails the whole run.
 *
 * `next dev` compiles each route on its first request. Requesting every route
 * here moves that cost out of the specs, whose client-side navigations would
 * otherwise wait on a cold compile.
 */

import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { HOME_TITLE, ORIGIN, REPO_ROOT, SIDECAR_ORIGIN, routeUrl } from './support';

const ROUTES = [
  '/',
  '/prose',
  '/about',
  '/components/forms',
  '/components/status',
  '/components/widgets',
  '/components/data',
];

export default async function globalSetup(): Promise<void> {
  const health = await fetch(`${SIDECAR_ORIGIN}/healthz`);
  if (!health.ok) throw new Error(`sidecar /healthz answered ${health.status}`);
  const info = (await health.json()) as { ok?: boolean; writeRoot?: string; routing?: string };
  if (info.ok !== true) throw new Error(`sidecar /healthz not ok: ${JSON.stringify(info)}`);
  if (!info.writeRoot || realpathSync(info.writeRoot) !== realpathSync(REPO_ROOT)) {
    throw new Error(`sidecar writeRoot ${info.writeRoot} is not this checkout (${REPO_ROOT})`);
  }
  if (!info.routing || basename(info.routing) !== 'scaffold.routing.json') {
    throw new Error(`sidecar routing ${info.routing} is not scaffold.routing.json`);
  }

  for (const route of ROUTES) {
    const response = await fetch(routeUrl(route));
    const html = await response.text();
    if (!response.ok) throw new Error(`Next dev server answered ${response.status} for ${route}`);
    if (route === '/' && !html.includes(`<title>${HOME_TITLE}</title>`)) {
      throw new Error(`Next dev server at ${ORIGIN} is not serving this example`);
    }
  }

  const dryRun = await fetch(`${ORIGIN}/api/dev/apply/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: true, tokens: { '--nx-radius': '0.5rem' } }),
    // The panel's applyEndpoint is the canonical URL; a redirect means it drifted.
    redirect: 'error',
  });
  const envelope = (await dryRun.json()) as { ok?: boolean; files?: Array<{ file?: string }> };
  if (
    dryRun.status !== 200 ||
    envelope.ok !== true ||
    envelope.files?.[0]?.file !== 'src/styles/tokens.css'
  ) {
    throw new Error(
      `/api/dev/apply did not reach the sidecar (${dryRun.status}: ${JSON.stringify(envelope)})`,
    );
  }
}
