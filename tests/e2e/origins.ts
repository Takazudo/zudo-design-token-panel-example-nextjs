// The dev ports `pnpm dev` binds (`_dev:next` / `_dev:tokens-bin` in package.json).
// Kept free of Playwright imports so playwright.config.ts can share it.
export const ORIGIN = 'http://localhost:44326';
export const SIDECAR_ORIGIN = 'http://127.0.0.1:24684';
