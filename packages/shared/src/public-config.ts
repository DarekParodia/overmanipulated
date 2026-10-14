// Public subset of the server's config.json (Stage 7, M5): everything the client may know about
// the server's settings. The server derives it per request Host and serves it from
// `GET /api/config` and as JSON embedded in the HTML shell. It is its own schema, never a pick of
// the server config, so a server-only key (ads sign-off, ads.txt lines, CSP extras) cannot leak.
// No WebSocket message carries it, so changing it never bumps PROTOCOL_VERSION.
import { z } from 'zod';
import { DEFAULT_DIFFICULTY, MOTD_MAX_CHARS } from './constants.ts';
import { difficultySchema } from './domain.ts';

/** `id` of the `<script type="application/json">` element that embeds the public config. */
export const PUBLIC_CONFIG_ELEMENT_ID = 'redakcja-config';

// --- Hosts ---------------------------------------------------------------------------------

/** A bare DNS host name, lower-cased: no scheme, no port; RFC 1035 lengths (253 total, 63 a label). */
export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/);

/**
 * A `Host` header or `location.hostname` as a bare lower-case host: the port and a trailing dot
 * are dropped and an IPv6 literal loses its brackets (`'[::1]:3000'` → `'::1'`); a bare IPv6
 * literal (two or more colons, no brackets) is kept whole. Empty or malformed → null.
 */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end < 0 || !/^(?::\d+)?$/.test(value.slice(end + 1))) return null;
    const inner = value.slice(1, end);
    return inner === '' ? null : inner;
  }
  if (value.indexOf(':') !== value.lastIndexOf(':')) return value;
  const host = value.replace(/:\d+$/, '').replace(/\.$/, '');
  return host === '' ? null : host;
}

/**
 * Whether `host` (from `normalizeHost`) is one of `domains`. Exact match only: a parent domain
 * or a wildcard never matches.
 */
export function hostAllowed(host: string | null, domains: readonly string[]): boolean {
  return host !== null && domains.includes(host);
}

// --- Feature flags -------------------------------------------------------------------------
// Flags gate entry points only (opening a room browser, starting versus, joining as a
// spectator, autoplaying the intro); rooms and matches already running keep going when one flips.

export const featureFlagSchema = z.enum(['roomBrowser', 'versus', 'spectators', 'intro']);
export type FeatureFlag = z.infer<typeof featureFlagSchema>;
export const FEATURE_FLAGS = featureFlagSchema.options;

// z.object, not a record: an older client strips a flag it does not know instead of failing.
export const featureFlagsSchema = z.object({
  roomBrowser: z.boolean(),
  versus: z.boolean(),
  spectators: z.boolean(),
  intro: z.boolean(),
} satisfies Record<FeatureFlag, z.ZodBoolean>);
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/**
 * Flags when config.json does not set them. The room browser is off until an operator turns it
 * on, so rooms of under-age players are never listed publicly by default.
 */
export const DEFAULT_FEATURE_FLAGS: Readonly<FeatureFlags> = Object.freeze({
  roomBrowser: false,
  versus: true,
  spectators: true,
  intro: true,
});

// --- Message of the day --------------------------------------------------------------------

export const motdToneSchema = z.enum(['info', 'warning']);
/** Stable id; the client remembers a dismissed id, so a message with a new id shows again. */
export const motdIdSchema = z.string().regex(/^[A-Za-z0-9._-]{1,40}$/);
/**
 * Operator-written text shown in the main menu: one paragraph, so no control characters and no
 * Unicode line or paragraph separators (U+2028, U+2029).
 */
export const motdSchema = z.object({
  id: motdIdSchema,
  text: z
    .string()
    .trim()
    .min(1)
    .max(MOTD_MAX_CHARS)
    .regex(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u),
  tone: motdToneSchema,
});

// --- Ads -----------------------------------------------------------------------------------

/** Screens that may hold an ad; gameplay, the briefing, overlays and dialogs never do. */
export const adPlacementSchema = z.enum(['menu', 'lobby', 'results', 'spectator']);
/** AdSense publisher id. */
export const adClientSchema = z.string().regex(/^ca-pub-\d{10,20}$/);
/** AdSense ad unit (slot) id. */
export const adSlotIdSchema = z.string().regex(/^\d{6,20}$/);
/** Ad unit per placement; a placement without one shows no ad. */
export const adSlotsSchema = z.partialRecord(adPlacementSchema, adSlotIdSchema);
/** Audience age tag sent with every ad request: children, teenagers, or not set (adults). */
export const adAgeTreatmentSchema = z.enum(['child', 'teen', 'unspecified']);
/**
 * How ads are served. `limited`: Google's limited ads, which use no cookies or local storage and
 * no personalisation, so they need no storage consent (which players under 16 cannot validly
 * give). `nonPersonalized`: non-personalised ads, which may still use cookies (frequency capping,
 * fraud checks) and need consent. Personalised ads are never offered (user decision 11).
 */
export const adModeSchema = z.enum(['limited', 'nonPersonalized']);

export type AdPlacement = z.infer<typeof adPlacementSchema>;
export type AdSlots = z.infer<typeof adSlotsSchema>;
export type AdAgeTreatment = z.infer<typeof adAgeTreatmentSchema>;
export type AdMode = z.infer<typeof adModeSchema>;

export const AD_PLACEMENTS = adPlacementSchema.options;
/** The game's audience is high-school students, so ads are tagged for teenagers unless set. */
export const DEFAULT_AD_AGE_TREATMENT: AdAgeTreatment = 'teen';
export const DEFAULT_AD_MODE: AdMode = 'limited';
/** While ads are tagged for these audiences, `limited` is the only accepted ads mode. */
export const LIMITED_ADS_ONLY_AGE_TREATMENTS = [
  'child',
  'teen',
] as const satisfies readonly AdAgeTreatment[];

/** The ads legal gate: minors (teen or child age treatment) only ever get limited ads. */
export function adModeAllowed(mode: AdMode, ageTreatment: AdAgeTreatment): boolean {
  if (mode === 'limited') return true;
  return !(LIMITED_ADS_ONLY_AGE_TREATMENTS as readonly AdAgeTreatment[]).includes(ageTreatment);
}

/**
 * Ads as one host sees them. The server has already matched the request Host against its ad
 * domains, so the block carries no domain list; `enabled: false` carries nothing else.
 */
export const publicAdsSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z
    .object({
      enabled: z.literal(true),
      mode: adModeSchema,
      client: adClientSchema,
      slots: adSlotsSchema,
      ageTreatment: adAgeTreatmentSchema,
    })
    .refine((ads) => adModeAllowed(ads.mode, ads.ageTreatment), {
      path: ['mode'],
      message: "ads.mode must be 'limited' while ageTreatment is 'teen' or 'child'",
    }),
]);

// --- Public config -------------------------------------------------------------------------

/** `'https://Example.org/a?b'` → `'https://example.org'`; a string that is not a URL stays as is. */
function urlOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

/** An http(s) URL reduced to its origin (scheme, host, non-default port; no path or slash). */
export const siteOriginSchema = z.url({ protocol: /^https?$/ }).overwrite(urlOrigin);

// z.object (not strict): an older client strips keys it does not know instead of failing.
export const publicConfigSchema = z.object({
  /** Server config revision: +1 for every reload that changed a value; 0 as started. */
  revision: z.number().int().nonnegative(),
  /** Public origin of the site when the operator set one (links in shared pages). */
  siteOrigin: siteOriginSchema.nullable(),
  features: featureFlagsSchema,
  /** Difficulty a new room starts at. */
  defaultDifficulty: difficultySchema,
  motd: motdSchema.nullable(),
  ads: publicAdsSchema,
});

export type MotdTone = z.infer<typeof motdToneSchema>;
export type Motd = z.infer<typeof motdSchema>;
export type PublicAds = z.infer<typeof publicAdsSchema>;
export type PublicConfig = z.infer<typeof publicConfigSchema>;

/** What the client assumes until (or unless) the server's config arrives: no ads, no message. */
export const DEFAULT_PUBLIC_CONFIG: Readonly<PublicConfig> = Object.freeze({
  revision: 0,
  siteOrigin: null,
  features: DEFAULT_FEATURE_FLAGS,
  defaultDifficulty: DEFAULT_DIFFICULTY,
  motd: null,
  ads: Object.freeze({ enabled: false as const }),
});
