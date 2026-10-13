// Server-side views of config.json: the room settings the registry reads at every room creation,
// and the public subset served to clients (`GET /api/config`, later embedded in the HTML shell).
// The public config is derived field by field per request Host, never as a pick of the server
// config, so a server-only key (ads sign-off, ads.txt lines, CSP extras, ad domains) cannot leak.
import {
  type Difficulty,
  type FeatureFlags,
  hostAllowed,
  type PublicAds,
  type PublicConfig,
} from '@redakcja/shared';
import type { ServerConfig } from './config.ts';

/** What the room registry reads from config.json; hot, so a reload applies to the next room. */
export type RoomSettings = {
  maxRooms: number;
  features: FeatureFlags;
  defaultDifficulty: Difficulty;
};

export function roomSettings(config: ServerConfig): RoomSettings {
  return {
    maxRooms: config.rooms.maxRooms,
    features: config.features,
    defaultDifficulty: config.rooms.defaultDifficulty,
  };
}

/**
 * Whether ads run for a request to `host` (from `normalizeHost`): ads are on, an AdSense client is
 * set and the host is one of `ads.domains` (exact match). A missing Host never gets ads.
 */
export function adsActiveFor(config: ServerConfig, host: string | null): boolean {
  return (
    config.ads.enabled && config.ads.client !== undefined && hostAllowed(host, config.ads.domains)
  );
}

/**
 * The message of the day as the client sees it at `nowMs`: null before `from` and from `until`
 * on (`from` inclusive, `until` exclusive). The time window itself stays on the server.
 */
export function activeMotd(motd: ServerConfig['motd'], nowMs: number): PublicConfig['motd'] {
  if (motd === null) return null;
  if (motd.from !== undefined && nowMs < Date.parse(motd.from)) return null;
  if (motd.until !== undefined && nowMs >= Date.parse(motd.until)) return null;
  return { id: motd.id, text: motd.text, tone: motd.tone };
}

export type PublicConfigContext = {
  /** Request host from `normalizeHost(Host)`; null when the header is missing or malformed. */
  host: string | null;
  nowMs: number;
  /** Config store revision (`ConfigStore.revision`). */
  revision: number;
  /**
   * Whether the page our JS runs in can carry the ads CSP: false when the HTML shell was built
   * without the nonce placeholder (S7-70), which forces ads off. Dev and preview serve their own
   * HTML without a CSP, so true there.
   */
  adsCspReady: boolean;
};

function publicAds(config: ServerConfig, ctx: PublicConfigContext): PublicAds {
  const { ads } = config;
  if (!ctx.adsCspReady || !adsActiveFor(config, ctx.host) || ads.client === undefined) {
    return { enabled: false };
  }
  return {
    enabled: true,
    mode: ads.mode,
    client: ads.client,
    slots: { ...ads.slots },
    ageTreatment: ads.ageTreatment,
  };
}

/** The public config for one request: what `GET /api/config` returns. */
export function toPublicConfig(config: ServerConfig, ctx: PublicConfigContext): PublicConfig {
  return {
    revision: ctx.revision,
    siteOrigin: config.site.publicOrigin ?? null,
    features: { ...config.features },
    defaultDifficulty: config.rooms.defaultDifficulty,
    motd: activeMotd(config.motd, ctx.nowMs),
    ads: publicAds(config, ctx),
  };
}
