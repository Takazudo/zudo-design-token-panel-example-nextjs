import type { Metadata } from 'next';

import '../src/styles/reset.css';
import '../src/styles/tokens.css';

import PanelBootstrap from './_components/PanelBootstrap';

/*
 * Root layout for the Next.js example.
 *
 * Stylesheets land first because layout.tsx is the canonical Next App Router
 * entry for global CSS — `tokens.css` defines the `--nx-*` custom properties
 * the panel rewrites at runtime. The panel's own chrome CSS is not imported:
 * the panel self-injects its stylesheet when it first mounts
 * (PORTABLE-CONTRACT §4.1.4), so visitors who never open it never download it.
 *
 * <PanelBootstrap /> is the `'use client'` island that calls `mountPanel()`
 * from a `useEffect`. It returns `null` — the panel adapter appends its own
 * DOM root outside the React tree — and rendering it once here wires the
 * adapter for every route in the app (the per-`storagePrefix` bind flag
 * inside mountPanel short-circuits StrictMode's double-invoke and any
 * subsequent layout re-renders).
 */
export const metadata: Metadata = {
  title: 'Next.js Example — Design Token Panel',
  description:
    'Next.js 15 + React 19 example app for @takazudo/zdtp — host-config-driven panel mounted as a Preact island via a "use client" boundary.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PanelBootstrap />
      </body>
    </html>
  );
}
