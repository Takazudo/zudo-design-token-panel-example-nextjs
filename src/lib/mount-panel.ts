/**
 * Next.js (App Router) host adapter for `@takazudo/zdtp`.
 *
 * The Astro example ships a package-provided host adapter
 * (`@takazudo/zdtp/astro/host-adapter`) that runs from a
 * per-page `<script>` block in `DesignTokenPanelHost.astro`. Next.js — like
 * the Vite + React sibling example — has no equivalent host component. The
 * panel is mounted as a Preact island from a `'use client'` React component
 * (`app/_components/PanelBootstrap.tsx`) whose `useEffect` calls
 * `mountPanel()`. The adapter logic is therefore ported here, with the body
 * deliberately mirrored from `examples/vite-react/src/lib/mount-panel.ts`
 * (NOT extracted into a shared module — each example self-contains its
 * adapter so consumers can lift one folder verbatim).
 *
 * Responsibilities (mirror the Astro adapter):
 *
 *  1. Own the `configurePanel(panelConfig)` call. The package's main entry
 *     installs event listeners and the astro fallback at module-init time;
 *     reapplyPersistedOverrides and reapplyFromStorage run via a post-configure
 *     hook that fires AFTER configurePanel supplies the host's storagePrefix
 *     (H2 fix, issue #111). Calling configurePanel inside the dynamic-import
 *     resolution is safe and keeps the panel JS out of the initial chunk.
 *     The host application is the single source of truth for the config
 *     object — it imports `panelConfig` from the local `../config/panel-config`
 *     module and this adapter wires it through.
 *  2. Install the console API on `window[cfg.consoleNamespace]`
 *     (`showDesignPanel` / `hideDesignPanel` / `toggleDesignPanel`). The
 *     namespace is a configured field — different consumers can pick
 *     distinct values to prove the contract is host-agnostic.
 *  3. Gate the panel module's dynamic import on the same probes the Astro
 *     adapter uses: any of the package's declared flag signals, or any
 *     persisted state payload in a readable envelope version. When none is
 *     set, the panel module stays out of the initial bundle and only loads
 *     when the user calls a `window.<ns>.*` helper from the console.
 *  4. After the dynamic import resolves, call `configurePanel(panelConfig)`
 *     on the freshly imported module BEFORE any other panel API runs, then
 *     call `reapplyPersistedOverrides()` so the panel applies persisted
 *     overrides ASAP (kills the FOUT on hard navigation when the user has
 *     tweaks saved).
 *
 * StrictMode + double-effect safety
 * ---------------------------------
 * Next.js dev mode also runs effects twice (React StrictMode is on by
 * default in App Router — see `next.config.ts`'s `reactStrictMode: true`).
 * The same per-`storagePrefix` bind-flag handling applies: we pin a flag on
 * `window.__zudoDesignTokenPanelAdapter` (the same map shape the package's
 * Astro adapter uses) so the lazy-load probes only fire once. The console
 * API re-installation is idempotent — re-assigning the same closures is
 * semantically a no-op — so leaving it ungated is fine.
 *
 * Eager-load gate signals
 * -----------------------
 * The suffixes and value rules that decide whether to eager-load come from
 * the package's `@takazudo/zdtp/constants` sub-entry, which is a standalone
 * module that does NOT import the panel — so this static import leaves First
 * Load JS unchanged and keeps the panel itself lazy. Both registries are
 * iterated whole, so the gate covers every signal the installed package
 * declares rather than a hand-picked subset.
 *
 * Deriving them (rather than hard-coding `-state-v2`, as this adapter used
 * to) is the migration the package's 0.5.1 notes prescribe: the readable
 * state-key registry self-updates at the next storage-format bump, so this
 * gate cannot silently go stale again. The package deliberately ships the
 * key set but NOT the content check — `valueRules` documents the semantics
 * and `statePayloadActivates` below implements them.
 */

import type { PanelConfig } from '@takazudo/zdtp';
import {
  EAGER_LOAD_GATE_KEY_SUFFIXES,
  EAGER_LOAD_GATE_STATE_FAMILY,
} from '@takazudo/zdtp/constants';
import { panelConfig } from '../config/panel-config';

// Mirrors the panel-module's main entry shape we lazy-import below.
type DesignTokenPanelModule = typeof import('@takazudo/zdtp');

interface DesignTokenPanelAdapterState {
  /** Per-`storagePrefix` bind flag — re-runs of mountPanel are no-ops. */
  bound: boolean;
  /** Memoised module promise so steady-state toggle/show/hide share one load. */
  modulePromise: Promise<DesignTokenPanelModule> | null;
}

interface ConsoleApiSurface {
  showDesignPanel?: () => Promise<void>;
  hideDesignPanel?: () => Promise<void>;
  toggleDesignPanel?: () => Promise<void>;
  // Allow co-existence with other helpers a host may install on the same
  // namespace (e.g. `window.<ns>.someOtherDebugHelper()`).
  [extra: string]: unknown;
}

type AdapterStateMap = Record<string, DesignTokenPanelAdapterState>;

interface AdapterWindow extends Window {
  __zudoDesignTokenPanelAdapter?: AdapterStateMap;
  // Index access for the configured console namespace.
  [namespace: string]: unknown;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getAdapterStateMap(win: AdapterWindow): AdapterStateMap {
  if (!win.__zudoDesignTokenPanelAdapter) {
    win.__zudoDesignTokenPanelAdapter = {};
  }
  return win.__zudoDesignTokenPanelAdapter;
}

function getAdapterState(win: AdapterWindow, key: string): DesignTokenPanelAdapterState {
  const map = getAdapterStateMap(win);
  let state = map[key];
  if (!state) {
    state = { bound: false, modulePromise: null };
    map[key] = state;
  }
  return state;
}

type EagerLoadFlagSuffix = keyof typeof EAGER_LOAD_GATE_KEY_SUFFIXES;

const EAGER_LOAD_FLAG_SUFFIXES = Object.keys(
  EAGER_LOAD_GATE_KEY_SUFFIXES,
) as EagerLoadFlagSuffix[];

/**
 * Probes EVERY flag signal the package's registry declares — not just
 * `:visible`. `-open`, `:autoload`, `-elpath-enabled` and
 * `-domtweaker-enabled` outlive a panel close (e.g. opening the panel once
 * writes `:autoload = "auto"`, which is never cleared by closing it), so a
 * visible-only gate leaves those features silently unrestored on the next
 * page load. Iterating the registry also means a signal added by a future
 * package version is picked up without touching this adapter.
 *
 * `requiredConfig` names a PanelConfig property that must be present for the
 * signal to count (`-domtweaker-enabled` is meaningless without a
 * `domTweaker` config), mirroring the package's own Astro host adapter.
 */
function hasActiveFlagSignal(cfg: PanelConfig): boolean {
  return EAGER_LOAD_FLAG_SUFFIXES.some((suffix) => {
    const { acceptedValues, requiredConfig } = EAGER_LOAD_GATE_KEY_SUFFIXES[suffix];
    if (
      requiredConfig !== null &&
      (cfg as unknown as Record<string, unknown>)[requiredConfig] === undefined
    ) {
      return false;
    }
    const raw = readStorage(`${cfg.storagePrefix}${suffix}`);
    return raw !== null && (acceptedValues as readonly string[]).includes(raw);
  });
}

/**
 * Implements `EAGER_LOAD_GATE_STATE_FAMILY.valueRules`: a blank or JSON-null
 * payload does not activate, empty objects/arrays do not activate, any other
 * primitive does, and malformed JSON fails OPEN so the panel gets a chance to
 * migrate or reject the stored payload rather than being skipped entirely.
 */
function statePayloadActivates(raw: string | null): boolean {
  if (raw === null || raw === '') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return true;
  }
  if (parsed === null) return false;
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
  return true;
}

/**
 * Probes every state-envelope version the installed package can still read.
 * Checking only the then-current `-state-v2` meant this gate went silent once
 * the package migrated persisted state to v3/v4 and deleted the v2 key.
 */
function hasPersistedOverrides(storagePrefix: string): boolean {
  return Object.values(EAGER_LOAD_GATE_STATE_FAMILY.keySuffixes).some((suffix) =>
    statePayloadActivates(readStorage(`${storagePrefix}${suffix}`)),
  );
}

/**
 * Lazily import the panel module. First call runs the panel module's
 * top-level bootstrap (which binds its own toggle/window listeners) and
 * configures the panel-config singleton with the host's `panelConfig`
 * BEFORE any panel API runs. Subsequent calls return the same promise so
 * `configurePanel` runs exactly once per `storagePrefix`-scoped state —
 * which matches the package's one-shot configurePanel contract.
 *
 * Why configurePanel runs HERE (not eagerly in PanelBootstrap.tsx): the
 * package main entry installs event listeners and the astro fallback at
 * module-init time; reapplyPersistedOverrides and reapplyFromStorage run via
 * a post-configure hook that fires when configurePanel is called (H2 fix,
 * issue #111). Calling configurePanel inside the dynamic-import resolution
 * therefore lands the host's config in the singleton before any reader sees
 * it, while keeping the panel JS out of the initial chunk (a static
 * `import { configurePanel }` from the panel package would pull the whole
 * module into the initial chunk and the Next.js bundler would fold the
 * dynamic import below back into the same chunk, defeating the lazy-load
 * demonstration).
 *
 * After configurePanel runs, call `reapplyPersistedOverrides()` so the
 * panel applies persisted overrides ASAP (matches the eager-reapply path
 * the Astro adapter triggers via the package's main-entry side effects).
 */
async function loadPanelModule(state: DesignTokenPanelAdapterState) {
  if (state.modulePromise === null) {
    state.modulePromise = import('@takazudo/zdtp').then((mod) => {
      // Configure FIRST — every other panel API below reads
      // getPanelConfig() and must observe the host's intended values, not
      // the package's DEFAULT_PANEL_CONFIG sentinel.
      mod.configurePanel(panelConfig);
      try {
        mod.reapplyPersistedOverrides();
      } catch (err) {
        // Defensive: never let a bad persist-state read kill the panel
        // surface. The panel will still mount with stylesheet defaults.
        console.warn(
          '[design-token-panel] reapplyPersistedOverrides() threw: ' + (err as Error).message,
        );
      }
      return mod;
    });
  }
  return state.modulePromise;
}

function installConsoleApi(
  win: AdapterWindow,
  namespace: string,
  state: DesignTokenPanelAdapterState,
): void {
  const existing = (win[namespace] as ConsoleApiSurface | undefined) ?? {};
  existing.showDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.showDesignTokenPanel();
  };
  existing.hideDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.hideDesignTokenPanel();
  };
  existing.toggleDesignPanel = async () => {
    const panel = await loadPanelModule(state);
    panel.toggleDesignPanel();
  };
  win[namespace] = existing;
}

/**
 * Bind the host adapter for the active panel config. Safe to call multiple
 * times — the per-`storagePrefix` `bound` flag short-circuits repeat calls,
 * which is exactly what React StrictMode requires (mount effects run twice
 * in dev). Returns nothing; the cleanup function from the calling
 * `useEffect` should also be a no-op.
 *
 * Reads the active config from the local `panelConfig` module so storage
 * keys / console namespace / etc. are derived from the same object that
 * `loadPanelModule()` will pass to `configurePanel(...)` once the panel
 * module finishes loading. The two derivations are guaranteed coherent
 * because there is exactly one `panelConfig` import in this file.
 */
export function mountPanel(): void {
  if (typeof window === 'undefined') return;

  const cfg = panelConfig;
  const win = window as unknown as AdapterWindow;
  const state = getAdapterState(win, cfg.storagePrefix);

  // Install console API every time — `bound` only gates the lazy-load
  // probes, since the console handlers are idempotent (re-assigning the
  // same closures is a no-op semantically).
  installConsoleApi(win, cfg.consoleNamespace, state);

  if (state.bound) return;
  state.bound = true;

  // Lazy-load gate — eagerly load the panel module when the user had it
  // open last session OR has persisted token overrides. Either signal
  // means the panel must boot before first paint to avoid an FOUT.
  if (hasActiveFlagSignal(cfg) || hasPersistedOverrides(cfg.storagePrefix)) {
    void loadPanelModule(state);
  }
}
