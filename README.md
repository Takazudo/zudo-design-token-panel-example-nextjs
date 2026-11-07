# zudo-design-token-panel-example-nextjs

A minimal Next.js 15 (App Router) + React 19 app demonstrating
`@takazudo/zdtp` — host-config-driven panel mounted from a `'use client'`
boundary, plus apply-pipeline round-trip via the bin sidecar (`zdtp-server`).
The panel renders with its own bundled zudo-react runtime (since zdtp 0.9.0;
it no longer uses Preact), in its own root element outside the host's React 19
tree.

Live demo: <https://zdtp-nextjs.zudolab.dev/>

## Setup

```bash
git clone https://github.com/Takazudo/zudo-design-token-panel-example-nextjs.git
cd zudo-design-token-panel-example-nextjs
pnpm install
```

The panel is the published npm package `@takazudo/zdtp`, pinned to an exact
version in `package.json`.

To see which panel version a page loaded, open the panel and read the shell's
`data-zdtp-version` attribute (zdtp 0.9.1 and later), for example
`document.querySelector('.tokenpanel-shell')?.dataset.zdtpVersion` in the
browser console. The value is the declared `version` of the zdtp build that
rendered the shell, and it is present only while the panel is open.

## Dev

```bash
pnpm dev
```

Runs two processes via `concurrently`:

| process | port  | role                                                                         |
| ------- | ----- | ---------------------------------------------------------------------------- |
| Next    | 44326 | the example site                                                             |
| bin     | 24684 | `zdtp-server` — receives `/apply` POSTs, rewrites `tokens.css` |

Open <http://localhost:44326/> and click **Open Design Token Panel** in the
top bar (or run `window.nx.toggleDesignPanel()` in the browser console).

## Build

```bash
pnpm build
```

Emits a static `out/` directory. Configured by:

| `next.config.ts` field | value                  | rationale                                                              |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------- |
| `trailingSlash`        | `true`                 | emits `<route>/index.html` so plain static hosts work without rewrites |
| `output`               | `'export'` (gated)     | static export — only set when `NEXT_BUILD_TARGET=export`               |
| `pageExtensions`       | gated                  | controls whether the dev-only API route is visible to the build        |

## Other commands

```bash
pnpm typecheck          # TypeScript type check
pnpm test:e2e           # Playwright browser suite (see below)
pnpm test:apply-smoke   # smoke test for the bin sidecar (requires pnpm dev running)
```

## Browser tests

`pnpm test:e2e` runs the Playwright suite against `next dev` plus the
`zdtp-server` sidecar — the two halves of `pnpm dev`, started by Playwright's
`webServer` (a `pnpm dev` you already have running is reused locally, never on
CI). It covers a real panel-driven Apply that rewrites `src/styles/tokens.css`
and restores it byte-for-byte, App Router soft navigation with back/forward,
single-instance panel ownership, the shell's `data-zdtp-version` matching the
installed package's `version`, token edits reaching computed styles, and
zero console/page/network errors on every route. Run
`pnpm exec playwright install chromium` once first.

CI runs the same suite in the blocking `browser` job of
`.github/workflows/deploy.yml`; content-only changes (`*.md` / `*.mdx`) log
`skipped: content-only` and pass.

## Apply pipeline

```
Panel UI → POST /api/dev/apply/ → Next API route (route.dev.ts, dev-only)
         → bin sidecar (port 24684) → atomic write → src/styles/tokens.css
```

The `.dev.ts` suffix keeps `app/api/dev/apply/route.dev.ts` out of the
static export build (`output: 'export'` rejects dynamic API routes).

## Identifier family

| field                 | value                                       |
| --------------------- | ------------------------------------------- |
| `storagePrefix`       | `next-example-tokens`                       |
| `consoleNamespace`    | `nx`                                        |
| `modalClassPrefix`    | `next-example-design-token-panel-modal`     |
| `schemaId`            | `next-example-design-tokens/v1`             |
| `exportFilenameBase`  | `next-example-design-tokens`                |
| CSS-var family        | `--nx-*`                                    |
| Next dev port         | `44326`                                     |
| bin sidecar port      | `24684`                                     |
