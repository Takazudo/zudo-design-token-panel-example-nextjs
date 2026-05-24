# zudo-design-token-panel-example-nextjs

A minimal Next.js 15 (App Router) + React 19 app demonstrating
`@takazudo/zdtp` — host-config-driven panel mounted as a
Preact island via a `'use client'` boundary, plus apply-pipeline round-trip
via the bin sidecar (`zdtp-server`).

Live demo: <https://zudo-design-token-panel-example-nextjs.pages.dev/>

## Sibling layout

This repo uses a `file:` dependency on the panel package. Both repos must
live as siblings under a shared parent:

```
$HOME/repos/zdtp-ex/
├── zudo-design-token-panel/          ← panel source (sibling)
└── zudo-design-token-panel-example-nextjs/  ← this repo
```

## Bootstrap (fresh checkout)

> WARNING: `pnpm install` alone on a fresh checkout WILL FAIL because the
> `file:../zudo-design-token-panel/packages/zudo-design-token-panel` sibling
> is not yet present. Always run `pnpm setup:upstream` first.

```bash
git clone https://github.com/Takazudo/zudo-design-token-panel-example-nextjs.git
cd zudo-design-token-panel-example-nextjs
pnpm setup:upstream
```

`pnpm setup:upstream` will:

1. Clone the panel sibling repo at the pinned SHA (or checkout the pin if
   already present).
2. Build the panel package so `dist/` is available.
3. Run `pnpm install` in this consumer.
4. Run `pnpm build` once to verify the setup.

## Dev

```bash
pnpm dev
```

Runs two processes via `concurrently`:

| process | port  | role                                                                         |
| ------- | ----- | ---------------------------------------------------------------------------- |
| Next    | 44326 | the example site                                                             |
| bin     | 24684 | `zdtp-server` — receives `/apply` POSTs, rewrites `tokens.css` |

Open <http://localhost:44326/> and run `window.nx.toggleDesignPanel()` in the
browser console to show the panel.

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
pnpm test:apply-smoke   # smoke test for the bin sidecar (requires pnpm dev running)
```

## Apply pipeline

```
Panel UI → POST /api/dev/apply → Next API route (route.dev.ts, dev-only)
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
