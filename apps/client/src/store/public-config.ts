// Public config from the server (S7-69): feature flags, the default difficulty, the message of
// the day and the ads block for this host. The HTML shell embeds it as JSON, so the first render
// already has it; dev and preview serve their own HTML, so there the client starts from the safe
// defaults (no ads, DEFAULT_FEATURE_FLAGS) and asks `GET /api/config`. A failed fetch never
// replaces what the client already has.
import {
  DEFAULT_PUBLIC_CONFIG,
  type FeatureFlag,
  PUBLIC_CONFIG_ELEMENT_ID,
  type PublicConfig,
  publicConfigSchema,
} from '@redakcja/shared';
import { create } from 'zustand';
import { fetchPublicConfig } from '../net/api.ts';

/** A non-forced refresh (main menu mount) asks the server at most once per this interval. */
export const PUBLIC_CONFIG_REFRESH_MS = 60_000;

export type PublicConfigSource = 'default' | 'embedded' | 'server';

export type PublicConfigState = {
  config: PublicConfig;
  source: PublicConfigSource;
  /** `now()` of the last successful fetch; null until one succeeded. */
  fetchedAt: number | null;
  /**
   * Asks the server again. Without `force`, does nothing within `PUBLIC_CONFIG_REFRESH_MS` of
   * the last attempt (successful or not); a refresh already in flight is shared, never doubled.
   */
  refresh(force?: boolean): Promise<void>;
};

/**
 * The config embedded by the HTML shell (`<script id="redakcja-config" type="application/json">`),
 * or null when there is none or it is not valid. Never throws.
 */
export function readEmbeddedConfig(doc: Pick<Document, 'getElementById'>): PublicConfig | null {
  try {
    const text = doc.getElementById(PUBLIC_CONFIG_ELEMENT_ID)?.textContent;
    if (!text) {
      return null;
    }
    const parsed = publicConfigSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type PublicConfigStoreOptions = {
  /** The embedded config, when the page has one. */
  embedded: PublicConfig | null;
  fetchConfig: () => Promise<PublicConfig | null>;
  now: () => number;
};

export function createPublicConfigStore(options: PublicConfigStoreOptions) {
  const { embedded, fetchConfig, now } = options;
  let lastAttemptAt: number | null = null;
  let inFlight: Promise<void> | null = null;

  return create<PublicConfigState>()((set) => ({
    config: embedded ?? DEFAULT_PUBLIC_CONFIG,
    source: embedded ? 'embedded' : 'default',
    fetchedAt: null,
    refresh(force = false) {
      if (inFlight) {
        return inFlight;
      }
      if (!force && lastAttemptAt !== null && now() - lastAttemptAt < PUBLIC_CONFIG_REFRESH_MS) {
        return Promise.resolve();
      }
      lastAttemptAt = now();
      const load = async () => {
        const config = await fetchConfig();
        if (config) {
          set({ config, source: 'server', fetchedAt: now() });
        }
      };
      // fetchConfig should not throw; if it does, the current config stays all the same.
      const pending = load()
        .catch(() => {})
        .finally(() => {
          inFlight = null;
        });
      inFlight = pending;
      return pending;
    },
  }));
}

function embeddedInPage(): PublicConfig | null {
  const doc = globalThis.document;
  return doc ? readEmbeddedConfig(doc) : null;
}

export const usePublicConfig = createPublicConfigStore({
  embedded: embeddedInPage(),
  fetchConfig: () => fetchPublicConfig(),
  now: () => globalThis.performance.now(),
});

/** Whether a feature's entry point is shown (the server enforces the flag on its own). */
export function useFeature(flag: FeatureFlag): boolean {
  return usePublicConfig((s) => s.config.features[flag]);
}
