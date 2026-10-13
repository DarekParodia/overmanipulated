# Cluster E — Server-side config.json, AdSense, deploy (HTML shell, CSP, ads.txt, privacy page, MOTD, feature flags, client IP)

# Cluster E: server config.json, AdSense and deploy

## 0. Summary of decisions

1. **One source of truth.** A zod-validated `config/config.json` is read by the Bun server. It hot-reloads through `fs.watch` on the mounted directory and on `SIGHUP`. An invalid file at reload keeps the old config. An invalid file at startup exits with code 1. A public subset (`publicConfigSchema` in `packages/shared`) reaches the client in two ways: through `GET /api/config`, and embedded as JSON in the HTML shell.
2. **The HTML shell (`/` and SPA paths) is rendered by the Bun server** from the built `dist/index.html`.
   - It injects `<meta name="google-adsense-account">` (verification) and the embedded public config.
   - It sets a per-request CSP. That is the old strict host policy when ads are off, and Google's nonce + `'strict-dynamic'` policy when ads are on for the request host.
   - Caddy keeps serving `/assets/*` (immutable) and other static files.
   - If the server is down, Caddy falls back to the static `index.html` (`handle_errors 502 503 504`).
3. **The AdSense loader is not put in `<head>`.** The client injects it lazily when the first `AdSlot` mounts, which can only happen on the menu, lobby, results or spectator view. So a page reload straight into a match (`resumeIfPossible`) never loads Google JS, and the Google consent dialog (CMP) never appears over gameplay. Verification uses the meta tag, one of the three methods Google documents.
4. **Ad privacy settings:**
   - Ads are non-personalised only: `adsbygoogle.requestNonPersonalizedAds = 1` before any push.
   - Every `<ins>` carries an age-treatment attribute (default teen: `data-tag-for-age-treatment="2"`).
   - Consent is handled by Google's certified CMP (AdSense Privacy & messaging). It is served by the AdSense tag; we provide a custom "Zgody reklamowe" revocation link.
   - When ads are on, `Referrer-Policy: strict-origin-when-cross-origin` is set, because Google's European-regulations message does not show with `no-referrer`.
5. **Client IP fix.** Caddy trusts the external TLS proxy (`trusted_proxies`). It forwards `{client_ip}` as `X-Real-IP`, the only address header the server reads. This is a prerequisite for per-IP throttles (room browser).
6. **No new runtime dependency.** The renderer is in-house (markdown-lite for `/prywatnosc`) and Google's scripts are external. The client ads module is about 2 KB gzip in the menu chunk.

## 1. Verified current state (what the design builds on)

| Fact | Where |
| --- | --- |
| Env-only config (`PORT`, `DATABASE_PATH`, `DEV_LATENCY_MS`, `BRIEFING_MS`) validated with zod | `apps/server/src/env.ts:4-11` |
| Entry is `readEnv → startServer`, handling only SIGINT/SIGTERM | `apps/server/src/index.ts:5-11` |
| `startServer(env)` wires registry, loop and `createApp({db, registry, devLatencyMs})`. Tests call it with an `Env` literal | `apps/server/src/server.ts:22-37`; `server.test.ts:17-22`; `tools/smoke/smoke.test.ts:20`; `limits.test.ts` |
| App mounts `/api`, `/health`, `/ws` | `apps/server/src/app.ts:8-19` |
| Chained `/api` routes (the place for `/config`) | `apps/server/src/routes/api.ts:31-59` |
| `healthStatus` is compared with `toEqual` in tests | `routes/api.ts:21-29`; `routes/api.test.ts:17-26` |
| `maxRooms` option is read at room creation (so it can be hot) | `rooms/registry.ts:117-118, 287` |
| Client IP is taken from the first XFF entry, which is now the proxy's IP for everyone | `routes/ws.ts:33-36`; `limits.test.ts:82` |
| Static strict CSP; `@backend` is only `/ws /api /api/* /health`; SPA fallback `try_files {path} /index.html` would swallow `/ads.txt` | `Caddyfile:9-22, 27, 68-75` |
| The header block contains `-Server`, so Caddy defers it and **overwrites** upstream headers | `Caddyfile:10` |
| Server image has no client build and no docs | `Dockerfile:35-49` |
| Only the `db` volume, no config | `docker-compose.yml:28-29` |
| Stale `DOMAIN` | `.env.example:3-6`; `docs/deploy.md:3-8, 30-45, 63, 140-141` |
| False XFF claim | `docs/deploy.md:108-109` |
| "Loads nothing from other hosts" | `docs/deploy.md:89-90` |
| Privacy note promises no ad cookies or external services | `docs/privacy.pl.md:11-12` |
| `index.html` is static, with no meta CSP and no external scripts | `apps/client/index.html` |
| Vite dev/preview proxy only `/ws` and `/api`; e2e uses `vite preview` | `apps/client/vite.config.ts:8-23`; `playwright.config.ts:38-58` |
| Smoke test checks CSP `frame-ancestors 'none'` and the HTML, and has a stand-in front | `tools/smoke/smoke.ts:200-234`; `smoke.test.ts:19-79` |
| `hc` client plus raw-fetch + zod pattern | `apps/client/src/net/api.ts:6, 14-29` |
| Boot effect | `apps/client/src/App.tsx:25-46` |
| `ScreenId` union | `store/app.ts:6` |
| `pl.errors` satisfies `Record<ErrorCode\|'connectionLost'>` | `strings/pl.ts:79-91` |
| `errorCodeSchema` | `packages/shared/src/protocol.ts:310-321` |
| `ResultsPlate` is mounted inside the HUD on `levelEnd` | `hud/Hud.tsx:33` |
| Panel widths: results 68rem, lobby 70rem | `ResultsPlate.module.css:30`; `Lobby.module.css:3` |
| Lobby ends with `<footer className={styles.bottom}>` holding the yellow start | `screens/Lobby.tsx:173-217` |
| Menu corner buttons top-right, card `min(100%,30rem)` | `MainMenu.tsx:70-89`; `MainMenu.module.css` |
| Gamepad focus set excludes iframes (ads unreachable by pad) | `input/menu-nav.ts:74-75` |
| `useMediaQuery` and `PHONE_QUERY` exist | `debrief/use-media-query.ts:5` |
| Colour literals forbidden outside the token files | `tools/design/check-tokens.ts` |
| Menu code guard 320 KB gzip | `tools/perf/check-bundle.ts:22-31` |
| zod `^4.6.5` (`.default` short-circuits, so nested objects need `.prefault({})`); Vite `^8.3.3` | `apps/server/package.json`; `apps/client/package.json` |

## 2. Architecture decision: who renders `<head>` and the CSP

| Option | How | Verdict |
| --- | --- | --- |
| (a) Static allowlist in the Caddyfile + runtime client injection | Google hosts always present in the CSP; client injects the script and meta | **Rejected.** The CSP is permanently weakened even with ads off. Google states that AdSense supports **only strict nonce CSP** because its domains change, so allowlists break silently. A runtime-injected meta is unreliable for verification. A domain change needs an image rebuild (Caddyfile is baked in). |
| (b) Caddyfile env placeholders (`{$CSP_ADS}`), Vite env meta | `.env` + compose + rebuild | **Rejected.** It splits config across `.env` and `config.json`. Recreating the web container drops every proxied WebSocket. The meta needs a rebuild. No per-request nonce is possible. |
| (c) Caddy `templates` / generated snippet from config | Server writes a snippet, Caddy includes it | **Rejected.** Two moving parts, Go-template logic untestable with `bun test`, and still no nonce. |
| **(d) Bun server renders the shell** | Hono route reads `dist/index.html` once and per request substitutes the nonce, injects the meta + embedded config and sets the CSP from config + Host | **Chosen.** Hot reload with no Caddy reload or rebuild. Strict policy stays byte-identical when ads are off. Google's strict nonce policy when ads are on. Gating per host (ad-free school domain possible). Testable with `app.request()`. Cost: the page depends on the server, mitigated by the static fallback; and the server image needs `index.html` from the same build. |

The nonce plumbing uses Vite's `html.cspNonce` (Vite ≥5.2). Vite writes a placeholder into the `nonce` attribute of every `<script>`, `<link rel=modulepreload|stylesheet>` it generates, plus a `<meta property="csp-nonce">`. Its preload helper copies that nonce onto dynamically injected preload links. Static and dynamic module imports inherit the nonce from the nonced entry, which is how `'strict-dynamic'` works.

## 3. Shared contracts (`packages/shared`)

### 3.1 `packages/shared/src/csp-nonce.ts` (new, no imports, so vite.config can import it)

```ts
/** Vite writes this into every nonce attribute (vite.config.ts html.cspNonce); the server replaces it per request. */
export const CSP_NONCE_PLACEHOLDER = '__REDAKCJA_CSP_NONCE__';
```

### 3.2 `packages/shared/src/public-config.ts` (new, exported from `index.ts`)

```ts
import { z } from 'zod';
import { difficultySchema } from './domain.ts'; // contract owned by the difficulty cluster
export { CSP_NONCE_PLACEHOLDER } from './csp-nonce.ts';

export const PUBLIC_CONFIG_ELEMENT_ID = 'redakcja-config';
export const MOTD_MAX_CHARS = 140;
export const AD_DOMAINS_MAX = 16;

export const hostnameSchema = z.string().trim().toLowerCase().max(253)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/);
export const adPlacementSchema = z.enum(['menu', 'lobby', 'results', 'spectator']);
export const adClientSchema = z.string().regex(/^ca-pub-\d{10,20}$/);
export const adSlotIdSchema = z.string().regex(/^\d{6,20}$/);
export const adAgeTreatmentSchema = z.enum(['child', 'teen', 'unspecified']);
export const featureFlagSchema = z.enum(['roomBrowser', 'versus', 'spectators', 'intro']);
export const featureFlagsSchema = z.object({
  roomBrowser: z.boolean(), versus: z.boolean(), spectators: z.boolean(), intro: z.boolean(),
});
export const DEFAULT_FEATURE_FLAGS = { roomBrowser: true, versus: true, spectators: true, intro: true } as const;
export const motdToneSchema = z.enum(['info', 'warning']);
export const motdSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  text: z.string().trim().min(1).max(MOTD_MAX_CHARS),
  tone: motdToneSchema,
});
export const publicAdsSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    client: adClientSchema,
    slots: z.partialRecord(adPlacementSchema, adSlotIdSchema),
    domains: z.array(hostnameSchema).min(1).max(AD_DOMAINS_MAX),
    ageTreatment: adAgeTreatmentSchema,
  }),
]);
// z.object (not strict): an older client strips unknown keys instead of failing.
export const publicConfigSchema = z.object({
  revision: z.number().int().nonnegative(),
  siteOrigin: z.url().nullable(),
  features: featureFlagsSchema,
  defaultDifficulty: difficultySchema,
  motd: motdSchema.nullable(),
  ads: publicAdsSchema,
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
export type FeatureFlag = z.infer<typeof featureFlagSchema>;
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;
export type AdPlacement = z.infer<typeof adPlacementSchema>;
export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  revision: 0, siteOrigin: null, features: { ...DEFAULT_FEATURE_FLAGS },
  defaultDifficulty: 'normal', motd: null, ads: { enabled: false },
};
/** Host header / location.hostname → bare lower-case host; '[::1]:3000' → '::1'. */
export function normalizeHost(raw: string | null | undefined): string | null;
/** Exact match only (no implicit parent or wildcard). */
export function hostAllowed(host: string | null, domains: readonly string[]): boolean;
```

`normalizeHost` algorithm:
1. Trim and lower-case the value.
2. If it starts with `[`, return the part inside the brackets.
3. Otherwise strip `:\d+$` and a trailing `.`.
4. Return `null` for an empty result.

### 3.3 Protocol

`errorCodeSchema` (`protocol.ts:310-321`) gains `'featureDisabled'`. It needs `pl.errors.featureDisabled = 'Ta opcja jest teraz wyłączona.'`. This is a breaking server→client enum change, so `PROTOCOL_VERSION` is bumped **once for Stage 7**, coordinated with the other clusters' wire changes (2 → 3 at the first S7 wire change; later S7 changes before the next deploy reuse it). `protocol.test.ts` gets an accept/reject case.

## 4. Server

### 4.1 `apps/server/src/paths.ts` (new)

Absolute defaults resolved from `import.meta.url`, so cwd does not matter. The Docker WORKDIR `/app` maps to the same layout.

```ts
export const DEFAULT_CONFIG_PATH = fileURLToPath(new URL('../../../config/config.json', import.meta.url));
export const DEFAULT_SHELL_HTML_PATH = fileURLToPath(new URL('../../client/dist/index.html', import.meta.url));
export const DEFAULT_PRIVACY_MD_PATH = fileURLToPath(new URL('../../../docs/privacy.pl.md', import.meta.url));
```

### 4.2 `env.ts` additions

All new variables are optional with no default, so existing `Env` literals in tests still compile.

```ts
CONFIG_PATH: z.string().min(1).optional(),
/** Kill switch; wins over config.json, also across reloads. */
ADS_ENABLED: z.stringbool().optional(),
SHELL_HTML_PATH: z.string().min(1).optional(),
PRIVACY_MD_PATH: z.string().min(1).optional(),
```

**Precedence rule** (documented in deploy.md and the Decision log):
- **Env only:** process and infrastructure settings — `PORT`, `DATABASE_PATH`, `LOG_LEVEL`, `DEV_LATENCY_MS`, `BRIEFING_MS` (e2e knob, deliberately not in config.json), and the `*_PATH` variables.
- **config.json:** product and runtime settings.
- **Overlap:** env overrides exist only as kill switches (`ADS_ENABLED`). They are applied to the raw JSON **before** validation, at startup and on every reload, so env always wins.

### 4.3 `apps/server/src/config.ts` (new)

```ts
const cspDirectiveSchema = z.enum(['script-src','style-src','img-src','font-src','media-src','connect-src','frame-src','worker-src']);
const cspSourceSchema = z.string().regex(
  /^(?:'(?:self|unsafe-inline|unsafe-eval|wasm-unsafe-eval|strict-dynamic)'|(?:https|wss|data|blob):|https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~\/-]*)?)$/);
export const cspExtraSchema = z.partialRecord(cspDirectiveSchema, z.array(cspSourceSchema).max(20));
/** ads.txt: comment, VARIABLE=value, or "domain, pubId, DIRECT|RESELLER[, certId]". No newlines. */
const ADS_TXT_LINE = /^(?:#[^\r\n]*|[A-Za-z]+=[^\s\r\n]+|[a-z0-9.-]+,\s*[^,\s]+,\s*(?:DIRECT|RESELLER)(?:,\s*[A-Za-z0-9]+)?(?:\s*#[^\r\n]*)?)$/i;
export const MAX_ROOMS_CEILING = 5000;
export const CONFIG_RELOAD_DEBOUNCE_MS = 250;

export const serverConfigSchema = z.strictObject({
  $schema: z.string().optional(),
  site: z.strictObject({
    publicOrigin: z.url({ protocol: /^https?$/ }).optional(),
    operator: z.strictObject({
      name: z.string().trim().min(1).max(120).optional(),
      contact: z.string().trim().min(1).max(200).optional(),
      hosting: z.string().trim().min(1).max(200).optional(),
    }).prefault({}),
  }).prefault({}),
  features: z.strictObject({
    roomBrowser: z.boolean().default(DEFAULT_FEATURE_FLAGS.roomBrowser),
    versus: z.boolean().default(DEFAULT_FEATURE_FLAGS.versus),
    spectators: z.boolean().default(DEFAULT_FEATURE_FLAGS.spectators),
    intro: z.boolean().default(DEFAULT_FEATURE_FLAGS.intro),
  }).prefault({}),
  motd: z.strictObject({
    id: motdSchema.shape.id, text: motdSchema.shape.text, tone: motdToneSchema.default('info'),
    from: z.iso.datetime({ offset: true }).optional(),
    until: z.iso.datetime({ offset: true }).optional(),
  }).nullable().default(null),
  rooms: z.strictObject({
    maxRooms: z.number().int().min(1).max(MAX_ROOMS_CEILING).default(MAX_ROOMS),   // limits.ts:16 = 300
    defaultDifficulty: difficultySchema.default('normal'),
  }).prefault({}),
  ads: z.strictObject({
    enabled: z.boolean().default(false),
    /** Serve the verification meta tag on ads.domains while ads are still off (AdSense site review). */
    verification: z.boolean().default(false),
    client: adClientSchema.optional(),
    slots: z.partialRecord(adPlacementSchema, adSlotIdSchema).default({}),
    domains: z.array(hostnameSchema).max(AD_DOMAINS_MAX).default([]),
    ageTreatment: adAgeTreatmentSchema.default('teen'),
    adsTxt: z.array(z.string().max(300).regex(ADS_TXT_LINE)).max(100).default([]),
  }).prefault({}),
  csp: z.strictObject({ extra: cspExtraSchema.default({}), adsExtra: cspExtraSchema.default({}) }).prefault({}),
}).superRefine((c, ctx) => {
  // ads.client required if ads.enabled || ads.verification (path ['ads','client'])
  // ads.domains non-empty if ads.enabled ; ads.slots has ≥1 entry if ads.enabled
  // motd.from < motd.until when both set
});
export type ServerConfig = z.output<typeof serverConfigSchema>;
export type ServerConfigInput = z.input<typeof serverConfigSchema>;
export const DEFAULT_SERVER_CONFIG: ServerConfig = serverConfigSchema.parse({});
export type ConfigOverrides = { adsEnabled?: boolean };
export class ConfigError extends Error {}

export function parseConfigText(text: string, overrides?: ConfigOverrides):
  { ok: true; config: ServerConfig } | { ok: false; error: string };
// JSON.parse error → `config.json: invalid JSON: <message>`; schema error → z.prettifyError(err)
export function applyOverrides(raw: unknown, overrides: ConfigOverrides): unknown; // sets raw.ads.enabled
export function changedPaths(prev: unknown, next: unknown, prefix?: string): string[]; // dotted leaf paths

export type ConfigSource = 'file' | 'defaults';
export type ReloadResult = { ok: true; changed: string[] } | { ok: false; error: string };
export type ConfigStore = {
  get(): ServerConfig;
  readonly revision: number;          // +1 per reload that changed ≥1 path
  readonly source: ConfigSource;
  reload(trigger: 'signal' | 'watch' | 'manual'): ReloadResult;
  subscribe(listener: (config: ServerConfig, changed: string[]) => void): () => void;
  close(): void;
};
export type ConfigStoreOptions = {
  path: string;
  overrides?: ConfigOverrides;
  readFile?: (path: string) => string | null;                // null = ENOENT
  watch?: boolean;                                         // default true
  watchDir?: (dir: string, onEvent: (filename: string | null) => void) => () => void; // default node:fs watch
  setTimer?: (fn: () => void, ms: number) => () => void;   // debounce, injectable
};
export function createConfigStore(options: ConfigStoreOptions): ConfigStore; // throws ConfigError if the file exists but is invalid
export function staticConfigStore(input?: ServerConfigInput): ConfigStore;   // tests, no watch
```

**Algorithm**

- **Startup:**
  1. `readFile(path)`.
  2. If the file is missing, use `DEFAULT_SERVER_CONFIG` with overrides applied, `source = 'defaults'`, and log `info 'config file not found, using defaults'`.
  3. If the file is invalid, throw `ConfigError`.
  4. If the file is valid, set `source = 'file'` and log `info 'config loaded'` with `{ path, ads: enabled }`.
- **Watching:**
  1. If `watch` is on and `dirname(path)` exists, call `watchDir(dirname, filename => filename === basename(path) || filename === null ? debounce(reload('watch')) : noop)`.
  2. Debounce over `CONFIG_RELOAD_DEBOUNCE_MS = 250`. Atomic-save editors produce `rename` events, and partial writes resolve on the next event.
  3. The default `watchDir` uses `fs.watch(dir, { persistent: false })`. `close()` stops it.
- **`reload(trigger)`:**
  - If the file is missing: keep the current config, log `warn 'config file missing, keeping current config'`, return `{ ok: false }`.
  - If the file is invalid: keep the current config, log `warn 'config reload rejected'` with `{ trigger, error }`, return `{ ok: false, error }`.
  - If the file is valid:
    1. Compute `changed = changedPaths(cur, next)`.
    2. If `changed` is non-empty, swap the config, bump `revision`, notify subscribers, and log `info 'config reloaded'` with `{ trigger, changed }`.
    3. Return `{ ok: true, changed }`.
- **Logging:** never logs IPs. The ads client id is not secret.

### 4.4 Wiring

**`index.ts`**

```ts
const env = readEnv();
let config: ConfigStore;
try {
  config = createConfigStore({ path: env.CONFIG_PATH ?? DEFAULT_CONFIG_PATH, overrides: { adsEnabled: env.ADS_ENABLED } });
} catch (error) {
  log.error('invalid config file, refusing to start', { error: String(error) });
  process.exit(1);
}
const shell = loadShellAssets({ indexPath: env.SHELL_HTML_PATH ?? DEFAULT_SHELL_HTML_PATH, privacyPath: env.PRIVACY_MD_PATH ?? DEFAULT_PRIVACY_MD_PATH });
const running = startServer(env, { config, shell });
process.on('SIGHUP', () => { config.reload('signal'); });   // compose `init: true` (tini) forwards SIGHUP
// SIGINT/SIGTERM: config.close(); running.stop() …
```

**`server.ts`**
- New signature: `startServer(env: Env, options: ServerOptions = {})`, where `type ServerOptions = { config?: ConfigStore; shell?: ShellAssets }`. Defaults are `staticConfigStore()` and `NO_SHELL`.
- It passes `settings: () => roomSettings(config.get())` into `createRoomRegistry`.
- It passes `{ config: () => config.get(), configMeta: () => ({ source: config.source, revision: config.revision }), shell }` into `createApp`.

**`registry.ts`**
- `RegistryOptions` gains `settings?: () => RoomSettings`, with `type RoomSettings = { maxRooms: number; features: FeatureFlags; defaultDifficulty: Difficulty }` (exported from `apps/server/src/public-config.ts`).
- Room creation (L287) reads `options.maxRooms ?? options.settings?.().maxRooms ?? MAX_ROOMS`. Existing tests stay unchanged.
- Other clusters read `settings().features.*` and `settings().defaultDifficulty` (see §10).

**`app.ts`**
- `AppDeps = ApiDeps & { devLatencyMs: number; shell?: ShellAssets }`.
- `ApiDeps` gains optional `config?: () => ServerConfig` and `configMeta?: () => { source: ConfigSource; revision: number }`. Tests that build `createApp({db, registry, devLatencyMs})` keep working.
- The shell router is mounted **last**: `.route('/', createShellRoutes({...}))`.

### 4.5 `apps/server/src/public-config.ts` (new, server-only derivation, never a `pick`)

```ts
export function adsActiveFor(config: ServerConfig, host: string | null): boolean
  // config.ads.enabled && config.ads.client !== undefined && hostAllowed(host, config.ads.domains)
export function activeMotd(motd: ServerConfig['motd'], nowMs: number): PublicConfig['motd']   // respects from/until
export function toPublicConfig(config: ServerConfig, ctx: { host: string | null; nowMs: number; revision: number; adsCspReady: boolean }): PublicConfig
  // ads: adsActiveFor && adsCspReady ? { enabled: true, client, slots, domains, ageTreatment } : { enabled: false }
export function roomSettings(config: ServerConfig): RoomSettings;
```

`adsCspReady` is `shell.indexHtml === null || shell.supportsNonce`. In dev, Vite serves the HTML with no CSP. In production, a template built without the nonce placeholder would let the nonce-only CSP block our own JS, so ads are then forced off and `log.warn` fires once.

### 4.6 REST

In `routes/api.ts`, chained so `AppType` carries the types:

```ts
.get('/config', (c) => {
  const meta = deps.configMeta?.() ?? { source: 'defaults', revision: 0 };
  const body: PublicConfig = toPublicConfig(deps.config?.() ?? DEFAULT_SERVER_CONFIG,
    { host: normalizeHost(c.req.header('host')), nowMs: Date.now(), revision: meta.revision, adsCspReady: deps.adsCspReady ?? true });
  return c.json(body, 200);
})
```

`healthStatus` adds `config: { source, revision }`; update the `api.test.ts` `toEqual`. Caddy already sends `no-store` on `/api/*`.

### 4.7 Shell (`apps/server/src/shell/`)

**`assets.ts`**

```ts
export type ShellAssets = { indexHtml: string | null; supportsNonce: boolean; privacyMarkdown: string | null };
export const NO_SHELL: ShellAssets;
export function loadShellAssets(paths: { indexPath: string; privacyPath: string }, read?: (p: string) => string | null): ShellAssets;
```

It validates that `indexHtml` contains `</head>` and `id="root"`, otherwise it is treated as null and logs a warn. It sets `supportsNonce = indexHtml.includes(CSP_NONCE_PLACEHOLDER)`. A missing build logs `info 'no client build found; HTML shell disabled'`, which is normal in dev.

**`render-shell.ts`** (pure)

```ts
export const NONCE_BYTES = 16;
export function createNonce(fill?: (b: Uint8Array) => Uint8Array): string; // base64 of 16 random bytes
export function jsonForHtml(value: unknown): string; // JSON.stringify + replace(/</g,'\\u003c') + U+2028/2029 escapes
export function escapeAttribute(value: string): string; // & " < > '
export function renderShell(template: string, input: { nonce: string; publicConfig: PublicConfig; adsAccount: string | null }): string;
```

`renderShell` replaces **all** occurrences of `CSP_NONCE_PLACEHOLDER` with the nonce. It then inserts before `</head>`:

```html
<meta name="google-adsense-account" content="ca-pub-…">   <!-- only when adsAccount -->
<script id="redakcja-config" type="application/json">{…jsonForHtml(publicConfig)…}</script>
```

The JSON `<script>` type is never executed, so CSP is not involved.

**`csp.ts`** (pure; the single TS source for both policies)

```ts
export type CspMode = 'base' | 'ads';
// Ordered so buildCsp({mode:'base'}) reproduces Caddyfile:21 byte for byte:
export const BASE_CSP_DIRECTIVES: ReadonlyArray<[string, readonly string[]]> = [
  ['default-src', ["'self'"]], ['script-src', ["'self'"]], ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:']], ['font-src', ["'self'"]], ['media-src', ["'self'", 'blob:', 'data:']],
  ['connect-src', ["'self'", 'wss:']], ['worker-src', ["'self'", 'blob:']], ['manifest-src', ["'self'"]],
  ['object-src', ["'none'"]], ['base-uri', ["'self'"]], ['form-action', ["'self'"]], ['frame-ancestors', ["'none'"]],
];
export function buildCsp(o: { mode: CspMode; nonce: string | null; extra?: CspExtra; adsExtra?: CspExtra }): string;
export function shellHeaders(mode: CspMode, csp: string): Record<string, string>;
```

`buildCsp` with `mode = 'ads'` overrides the base directives as follows. This is Google's AdSense strict policy for scripts; the other fetch directives are relaxed only as far as ad iframes, pixels and the CMP need.
- `script-src 'nonce-N' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http:`. The `'unsafe-inline'` and `https: http:` entries are ignored by CSP3 browsers and act only as fallbacks.
- `style-src 'self' 'unsafe-inline' https:`
- `img-src 'self' data: blob: https:`
- `font-src 'self' data: https:`
- `connect-src 'self' wss: https:`
- `frame-src https:` (new directive; fenced frames fall back to it)
- `object-src 'none'` and `frame-ancestors 'none'` are kept.
- Then `extra`, and in ads mode also `adsExtra`, are appended per directive. A directive missing from the base set is created.

`shellHeaders` returns `{ 'Content-Security-Policy': csp, 'Referrer-Policy': mode==='ads' ? 'strict-origin-when-cross-origin' : 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cache-Control': 'no-store' }`. `no-store` is used because the body carries a per-request nonce.

**`markdown-lite.ts`** (pure, about 100 lines; for `/prywatnosc`)

```ts
export function renderMarkdownLite(md: string, ctx: { vars: Record<string, string | undefined>; flags: { ads: boolean } }): { title: string; html: string };
```

Escape first, then interpret only this subset:
- `#`, `##`, `###` headings;
- paragraphs (blank-line separated, soft lines joined);
- `- ` lists;
- pipe tables with a `| --- |` row;
- `**bold**`;
- `` `code` ``;
- `[text](url)` links, with `url` limited to `^(https?:\/\/|\/)`;
- block markers `<!-- ads -->…<!-- /ads -->` and `<!-- no-ads -->…<!-- /no-ads -->`;
- variables `{{operator.name|fallback}}`. The fallback text lives in the markdown, so there is no Polish in code.

The title is the first `#` heading.

**`routes/shell.ts`**

```ts
export type ShellDeps = { config: () => ServerConfig; revision: () => number; shell: ShellAssets; now?: () => number; nonce?: () => string };
export function createShellRoutes(deps: ShellDeps) {
  return new Hono()
    .get('/ads.txt', …)
    .get('/prywatnosc', …)
    .get('*', …);
}
```

- **`/ads.txt`:** if `adsTxt` is empty, return `404`. Otherwise return `200`, `content-type: text/plain; charset=utf-8`, `Cache-Control: public, max-age=300`, body `lines.join('\n') + '\n'`. It is served for every host and independent of `ads.enabled`, because ads.txt is needed before ads go live.
- **`/prywatnosc`:** if `privacyMarkdown` is null, return `404`. Otherwise:
  1. Render with `vars` from `config.site.operator` and `flags.ads = config.ads.enabled`.
  2. Wrap in a minimal `<!doctype html><html lang="pl">` document with `<meta name="viewport">`, `<title>`, and an inline `<style>` with a readable column (max-width 40rem, line-height 1.5). `'unsafe-inline'` styles are already allowed.
  3. Send headers `shellHeaders('base', buildCsp({mode:'base', nonce:null, extra}))` and `Cache-Control: no-cache`. The privacy page never shows ads.
- **`*` (the shell):**
  - Return `notFound()` when:
    - the method is not GET or HEAD (Hono serves HEAD through GET);
    - the path is reserved (`/api`, `/api/*`, `/ws`, `/health`, `/assets/*`), so an unknown API path never returns HTML;
    - the last segment has a `.` and the path is not `/index.html`, so a missing `foo.js` gets 404, not HTML;
    - `indexHtml` is null.
  - Otherwise:
    1. `host = normalizeHost(Host)`, `cfg = deps.config()`.
    2. `ads = adsActiveFor(cfg, host) && shell.supportsNonce`.
    3. `nonce = createNonce()`.
    4. `adsAccount = cfg.ads.client && (ads || (cfg.ads.verification && hostAllowed(host, cfg.ads.domains))) ? cfg.ads.client : null`.
    5. `html = renderShell(...)`.
    6. Return `c.html(html, 200, shellHeaders(ads ? 'ads' : 'base', buildCsp({mode, nonce, extra: cfg.csp.extra, adsExtra: cfg.csp.adsExtra})))`.

**Header ownership** (documented in deploy.md):

| Header | Owner |
| --- | --- |
| `Content-Security-Policy`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Cache-Control` on the shell, `/prywatnosc`, `/ads.txt` | Bun server |
| HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`, `-Server` | Caddy |
| CSP, Referrer-Policy and COOP for static files and the fallback | Caddy `?` defaults (set only if absent) |

### 4.8 Client IP

New `apps/server/src/client-address.ts`:

```ts
export function clientAddress(c: Context): string { return c.req.header('x-real-ip')?.trim() || getConnInfo(c).remote.address || 'unknown'; }
```

`X-Real-IP` is set (overwritten) by Caddy from `{client_ip}`. XFF parsing is removed. `ws.ts` imports it (L29-36 deleted). The room-browser throttle reuses it. `limits.test.ts:82` switches to `x-real-ip`. A new test `ignores X-Forwarded-For` checks that 21 creates with different XFF but no X-Real-IP from one socket address hit the limit.

## 5. Deploy

### 5.1 `vite.config.ts`

```ts
import { CSP_NONCE_PLACEHOLDER } from '../../packages/shared/src/csp-nonce.ts';
// …
html: { cspNonce: CSP_NONCE_PLACEHOLDER },
```

Also add `'/ads.txt'` and `'/prywatnosc'` to both `server.proxy` and `preview.proxy` (target `http://${serverTarget}`) for dev and preview parity. Under `vite preview` the placeholder stays literal (no CSP there) and is harmless.

### 5.2 Dockerfile (server stage, after `COPY apps/server apps/server`)

```dockerfile
# HTML shell rendered per request (config-driven head tags + CSP). Same build as the web image's /srv:
# always build both services together (docker compose up -d --build).
COPY --from=client-build /app/apps/client/dist/index.html apps/client/dist/index.html
COPY docs/privacy.pl.md docs/privacy.pl.md
RUN mkdir -p /data /app/config && chown bun:bun /data
```

The web stage is unchanged: it still copies `dist`, including `index.html`, used for the fallback. Add `config/config.json` to `.dockerignore`.

### 5.3 Caddyfile (full target)

```caddyfile
{
	servers {
		# The external TLS proxy reports the browser address in X-Forwarded-For; trust only it.
		trusted_proxies static {$TRUSTED_PROXIES:private_ranges}
		trusted_proxies_strict
		client_ip_headers X-Forwarded-For
	}
}

(security_headers) {
	header {
		-Server
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
		# Defaults only: the game server sets these itself on the HTML shell (config-driven).
		?Referrer-Policy "no-referrer"
		?Cross-Origin-Opener-Policy "same-origin"
		?Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob: data:; connect-src 'self' wss:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
	}
}

(game_server) {
	reverse_proxy server:3000 {
		header_up X-Real-IP {client_ip}
		transport http {
			dial_timeout 3s
			response_header_timeout 15s
		}
		health_uri /health
		health_interval 5s
		health_timeout 2s
		stream_close_delay 5m
	}
}

:80 {
	encode zstd gzip
	root * /srv
	import security_headers

	@backend path /ws /api /api/* /health
	handle @backend {
		header Cache-Control "no-store"
		request_body {
			max_size 8KB
		}
		import game_server
	}

	handle /assets/* {    # unchanged block minus its own root
		…
	}

	# Static public files (manifest, icons) but never the HTML shell.
	@static {
		not path / /index.html
		file
	}
	handle @static {
		header Cache-Control "no-cache"
		file_server {
			precompressed br
		}
	}

	# "/", SPA paths, /ads.txt, /prywatnosc: rendered by the game server.
	handle {
		request_body {
			max_size 8KB
		}
		import game_server
	}

	# Game server down: serve the static shell so the menu can say "Serwer gry nie odpowiada".
	handle_errors 502 503 504 {
		import security_headers
		@page not path /ads.txt /api/* /ws /health
		handle @page {
			rewrite * /index.html
			header Cache-Control "no-store"
			file_server
		}
	}
}
```

Notes:
- `?Header` defaults are deferred and do not override upstream values (per the Caddy docs).
- `trusted_proxies_strict` parses XFF right-to-left.
- `handle_errors` with status codes and `trusted_proxies_strict` need Caddy ≥ 2.8; `caddy:2-alpine` is current 2.x.
- Do **not** add Privacy Sandbox features (`browsing-topics`, `run-ad-auction`, …) to `Permissions-Policy`. Chrome is retiring them, and unrecognised features log console errors. Non-personalised + age treatment already covers this.
- `index.html.br` (precompress) is now unused except by nobody. Leave it, and document it.

### 5.4 Other deploy files

**docker-compose.yml**
- `server.environment.CONFIG_PATH: /app/config/config.json`
- `server.volumes: [db:/data, ./config:/app/config:ro]`. Mount the directory, not the file, so atomic saves are seen and inotify works on Linux. The file must be world-readable, because the container runs as uid `bun`.
- `web.environment.TRUSTED_PROXIES: ${TRUSTED_PROXIES:-private_ranges}`

**.env.example**
- Remove `DOMAIN`.
- Keep `LOG_LEVEL`.
- Add `TRUSTED_PROXIES` (comment: same host = private_ranges; other machine = `203.0.113.4/32`).
- Add a pointer to `config/config.json`.

**.gitignore**
- Add `/config/config.json`.
- Commit `config/config.example.json` and `config/config.schema.json`, the latter generated by `tools/deploy/config-schema.ts` via `z.toJSONSchema(serverConfigSchema, { io: 'input', unrepresentable: 'any' })`, with a test that it is up to date.

**Ops tool:** `tools/deploy/config-check.ts`, run as `bun run config:check -- config/config.json`. It prints a validation OK or the prettified error, the effective config, and the public config for each `ads.domains` host. Run it before saving on the server.

**Reload instructions:** save the file (watch), or `docker compose kill -s SIGHUP server`. Running matches are untouched.

**`config/config.example.json`**

```json
{
  "$schema": "./config.schema.json",
  "site": { "publicOrigin": "https://bronsie.drkp.dev", "operator": { "name": "…", "contact": "…", "hosting": "…" } },
  "features": { "roomBrowser": true, "versus": true, "spectators": true, "intro": true },
  "motd": null,
  "rooms": { "maxRooms": 300, "defaultDifficulty": "normal" },
  "ads": {
    "enabled": false, "verification": false,
    "client": "ca-pub-0000000000000000",
    "slots": { "menu": "1111111111", "lobby": "2222222222", "results": "3333333333", "spectator": "4444444444" },
    "domains": ["bronsie.drkp.dev"],
    "ageTreatment": "teen",
    "adsTxt": ["google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0"]
  },
  "csp": { "extra": {}, "adsExtra": {} }
}
```

### 5.5 Smoke test (`tools/smoke/smoke.ts`)

Add the following checks:
1. **`GET /api/config`:** 200 and `publicConfigSchema.safeParse`. The detail line shows `ads on|off, revision N`.
2. **In `GET / (HTML)`:**
   - Extract `<script id="redakcja-config" …>`. If it is missing, **warn** "HTML shell not rendered by the game server (static fallback?)".
   - If the CSP contains `'strict-dynamic'`: require `'nonce-X'`, and require X to equal the `nonce` on the module `<script>`. Require `Referrer-Policy` ≠ `no-referrer`, otherwise warn "consent message will not show".
   - Otherwise require `script-src 'self'` and no `'unsafe-eval'`.
   - **Fail** on a mismatch between embedded `ads.enabled` and the CSP mode.
3. **`GET /` twice (ads mode only):** the nonces differ, otherwise fail ("cached shell").
4. **`GET /ads.txt`:** 404 = pass ("not configured"); 200 `text/plain` without `<html` = pass; HTML = **fail** ("SPA fallback swallowed /ads.txt").
5. **`GET /prywatnosc`:** 200 html with `<h1` = pass.
6. **`GET /manifest.webmanifest`:** 200, not html, `Cache-Control: no-cache`.

Changes to `smoke.test.ts`:
- The stand-in front proxies `/`, `/api/config`, `/ads.txt` and `/prywatnosc` to the backend.
- `startServer(env, { shell: { indexHtml: FIXTURE_WITH_PLACEHOLDER, supportsNonce: true, privacyMarkdown: '# Prywatność\n\nTekst.' }, config: staticConfigStore({ ads: { adsTxt: ['google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0'] } }) })`.
- A second describe uses ads enabled for `localhost` and asserts the strict-dynamic checks pass and nonces differ.

### 5.6 Dev and e2e paths

- Vite dev (5173) and preview (4173) serve `index.html` themselves: no CSP, no embedded config. The client falls back to `GET /api/config` through the proxy.
- e2e runs with no config file, so defaults apply and ads are off. Existing specs and the perf spec are unaffected.
- The production path (Bun shell + Caddy) is covered by the server route tests, `smoke.test.ts`, `tools/deploy/caddyfile.test.ts` (base-CSP parity), and a manual local production-like run. That run uses the deploy.md recipe: `sed` swaps `server:3000→localhost:3000`, `root * /srv→dist`, `:80→:8080`. The browser console must show no `securitypolicyviolation` with ads on, with the Google script reachable.

## 6. Client

### 6.1 Public config store

`apps/client/src/store/public-config.ts`:

```ts
export const PUBLIC_CONFIG_REFRESH_MS = 60_000;
type PublicConfigStore = { config: PublicConfig; source: 'default' | 'embedded' | 'server'; fetchedAt: number | null; refresh(force?: boolean): Promise<void> };
export const usePublicConfig = create<PublicConfigStore>(…); // initial: readEmbeddedConfig(document) ?? DEFAULT_PUBLIC_CONFIG
export function readEmbeddedConfig(doc: Pick<Document, 'getElementById'>): PublicConfig | null; // JSON.parse + safeParse, never throws
export function useFeature(flag: FeatureFlag): boolean;
```

- `net/api.ts` gains `fetchPublicConfig(): Promise<PublicConfig | null>`. It calls `api.config.$get()` and runs `publicConfigSchema.safeParse`. Any error returns null, and the store keeps its current value. Safe defaults are ads off and the features from `DEFAULT_FEATURE_FLAGS`, which match the server defaults.
- `App.tsx` boot effect calls `void usePublicConfig.getState().refresh(true)`.
- `MainMenu` mount calls `refresh()`, throttled by `PUBLIC_CONFIG_REFRESH_MS`, so MOTD and flag changes appear without a reload.

### 6.2 MOTD banner

Files: `apps/client/src/screens/menu/MotdBanner.tsx`, `MotdBanner.module.css`, `motd-model.ts`.

- `motd-model.ts` exports `visibleMotd(motd, dismissedId): Motd | null`.
- The dismissed id is stored under the localStorage key `redakcja.motd.dismissed`, via `store/safe-storage.ts`.
- It is mounted in `MainMenu.tsx` between `<header>` and the card section, in the same ≤ 30rem column.
- Visual:
  - white surface, `--stroke` outline in `--blue-dark` (info) or `--orange-dark` (warning);
  - icon `lightbulb` (info) or `siren` (warning), existing icons;
  - `typeset(text)` at `--text-md`;
  - a secondary `Button` with `close` icon, `aria-label=pl.menu.motdClose`, 48 px target, **not** `back` (so pad B does not dismiss it).
- Never yellow; the menu keeps exactly one primary ("Otwórz pokój").
- `role="status"`, `aria-label=pl.menu.motdLabel`.
- No new cue: the Button emits `ui.click`.
- Text is operator-authored runtime Polish, an exception to "all strings in pl.ts" recorded in the Decision log. It is capped at 140 characters, so at most 2 lines at 640 px.
- It is shown only in the main menu.

### 6.3 Ads module (`apps/client/src/ads/`)

**`ads-model.ts`** (pure)

```ts
export const AD_ELIGIBLE_SCREENS: ReadonlySet<ScreenId> = new Set(['mainMenu', 'lobby']);
export function adEligible(i: { screen: ScreenId; levelEnded: boolean; spectating: boolean }): boolean
  // AD_ELIGIBLE_SCREENS.has(screen) || (screen === 'game' && (levelEnded || spectating))
export function adsActiveHere(ads: PublicConfig['ads'], hostname: string): boolean; // enabled && hostAllowed(normalizeHost(hostname), ads.domains)
export function slotFor(ads: PublicConfig['ads'], placement: AdPlacement): string | null;
export function ageTreatmentAttributes(t: AdAgeTreatment): Record<string, string>;
  // child → {'data-tag-for-age-treatment':'1'}, teen → {'data-tag-for-age-treatment':'2'}, unspecified → {}
export function loaderUrl(client: string): string;
  // 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client)
```

**`placements.ts`** (UI layout constants, not balance)

```ts
export const AD_MIN_GAP_PX = 150;          // AdSense game-page guidance; e2e asserts it
export const ADS_LOAD_TIMEOUT_MS = 8000;
export const AD_PLACEMENTS: Record<AdPlacement, { query: string; size: { w: number; h: number } }> = {
  menu:      { query: '(min-width: 1180px) and (min-height: 680px)', size: { w: 160, h: 600 } }, // left rail
  lobby:     { query: '(min-width: 800px) and (min-height: 600px)',  size: { w: 728, h: 90 } },  // under the footer
  results:   { query: '(min-width: 1780px) and (min-height: 700px)', size: { w: 160, h: 600 } }, // rail beside the 68rem panel
  spectator: { query: '(min-width: 1280px) and (min-height: 720px)', size: { w: 728, h: 90 } },  // spectator cluster places it
};
```

None of these queries match phones (`PHONE_QUERY` is `max-height:500px` or `max-width:760px`), so **phones never show ads**.

**`adsense.ts`** (side effects; typed `Window` augmentation, no `any`)

```ts
export type AdLoaderState = 'idle' | 'loading' | 'ready' | 'blocked';
export const useAdLoader = create<{ state: AdLoaderState }>(() => ({ state: 'idle' }));
export function ensureAdSense(client: string, deps?: { doc?: Document; timeoutMs?: number }): Promise<boolean>;
export function pushSlot(ins: HTMLElement): void;
export function setAdRequestsPaused(paused: boolean): void; // only if adsbygoogle initialised: pauseAdRequests = paused ? 1 : 0
export function openConsentSettings(): void;
```

`ensureAdSense` is idempotent and memoised per page:
1. `window.adsbygoogle ??= []`; set `requestNonPersonalizedAds = 1` and `pauseAdRequests = 0` before anything is pushed.
2. Append `<script async crossorigin="anonymous" src=loaderUrl(client)>`, with `script.nonce` read from `meta[property="csp-nonce"]`. Not needed under `'strict-dynamic'`, but harmless.
3. `onload` → `ready` / `true`. `onerror` or timeout → `blocked` / `false`, silently: no console error from our code and no "disable your adblocker" message.

`pushSlot` skips elements already in a WeakSet or carrying `data-adsbygoogle-status`; this covers StrictMode double effects. It runs `try { adsbygoogle.push({}) } catch {}`.

`openConsentSettings` runs `googlefc ??= {}; googlefc.callbackQueue ??= []; push({ CONSENT_DATA_READY: () => googlefc.showRevocationMessage() })`.

**`AdSlot.tsx`** — `export function AdSlot({ placement }: { placement: AdPlacement })`
- Renders `null` unless all of these hold: `adsActiveHere(config.ads, location.hostname)`, `slotFor()` is non-null, `useMediaQuery(AD_PLACEMENTS[placement].query)` matches (reusing `debrief/use-media-query.ts`), and the loader state is not `blocked`.
- Renders `<aside className={rail + placement} aria-label={pl.ads.label} data-ad-placement={placement}>` containing a label `<span aria-hidden>Reklama</span>` and `<ins ref className="adsbygoogle {unit}" data-ad-client data-ad-slot {...ageTreatmentAttributes} />`.
- The `<ins>` is fixed-size through a CSS class: `display:inline-block; width/height` from the size table. No `data-ad-format`, so there is no layout shift and the gap is predictable.
- Effect: `ensureAdSense(client).then(ok => ok && pushSlot(ref.current))`, keyed by `[placement, slot]` only. Lobby re-renders on `roomState` must not re-push or re-key it, so it is wrapped in `memo`.
- **No cue, no animation, no sound.** AdSense forbids drawing attention to ads, and `game-feel.md` records this exception.

**`AdSlot.module.css`**
- `.rail`: `position: fixed` for menu and results, static for lobby; white surface with `--outline-border`, `--radius-md`, `--space-2` padding.
- `.rail:has(ins[data-ad-status="unfilled"]) { display: none }`
- `.menu { left: max(var(--space-4), env(safe-area-inset-left)); top: 50%; transform: translateY(-50%) }`
- `.results { right: max(var(--space-4), env(safe-area-inset-right)); top: 50%; translate: 0 -50% }`
- `.lobby { justify-self: center; margin-top: var(--space-ad-gap) }`
- New token in `tokens.css`: `--space-ad-gap: 9.5rem; /* 152 px ≥ AD_MIN_GAP_PX */`.

Gap checks:
- Menu at 1180: card left edge 350, rail right edge ≈ 192, gap 158 ✓.
- Results at 1780: (1780 − 1088)/2 = 346 ≥ 160 + 16 + 150 ✓.

**`use-ad-pause.ts`** — `useAdRequestPause()` is mounted in `App.tsx`. It reads `useApp(s => s.screen)`, `useGame(s => s.levelEnd !== null)` and `spectating`, which the spectator cluster supplies. It calls `setAdRequestsPaused(!adEligible(...))`. This guards against Auto ads or anchors if they are accidentally enabled in the AdSense UI. Our slots only mount on eligible screens and are never in `StationOverlay`, `DeskOverlay`, dialogs or the briefing.

**Placements**
- `MainMenu.tsx`: `<AdSlot placement="menu" />`.
- `Lobby.tsx`: after `<footer className={styles.bottom}>`.
- `hud/ResultsPlate.tsx`: inside `.backdrop`, beside the panel.
- The spectator cluster mounts `<AdSlot placement="spectator" />` in its layout and must pass the same e2e gap test.

**Footer** — `screens/menu/MenuFooter.tsx`:
- A shared row of text links at the bottom of the main-menu column, never yellow, ≥ 48 px targets.
- `Prywatność` → `<a href="/prywatnosc" target="_blank" rel="noopener">`.
- `Zgody reklamowe` → ghost `Button` calling `openConsentSettings()`, shown only when `useAdLoader.state === 'ready'`.
- The UI cluster adds its `O grze` link here.
- Google requires a revocation link; we use our own link instead of Google's floating button, which would overlay the game. The floating link must be turned off in the AdSense message settings.

### 6.4 Per-device behaviour

| Element | Keyboard | Gamepad | Touch | 640×360 |
| --- | --- | --- | --- | --- |
| MOTD banner | Tab reaches the close button; Enter dismisses | menu-nav focuses close as a normal control; initial focus stays on the yellow button; B does not dismiss | 48 px close | full column width, ≤ 2 lines, scrolls with the menu |
| Footer links | Tab | reachable (`a[href]`, button) | 48 px | in scroll flow under the card |
| Ads | not focusable (iframe outside `FOCUSABLE`, `menu-nav.ts:74`) | unreachable | tablets ≥ 800×600 get the lobby banner only | none (no placement query matches phones) |
| Google CMP dialog | Google's DOM; buttons are in our document, so Tab and menu-nav reach them | reachable | tap | Google's responsive layout; appears only on menu or lobby, never in play |

### 6.5 Strings (`pl.ts`)

- `pl.errors.featureDisabled: 'Ta opcja jest teraz wyłączona.'`
- `pl.menu.motdLabel: 'Komunikat redakcji'`
- `pl.menu.motdClose: 'Zamknij komunikat'`
- `pl.menu.privacy: 'Prywatność'`
- `pl.menu.adConsent: 'Zgody reklamowe'`
- `pl.ads = { label: 'Reklama' }` ("Reklama" is an allowed ad label)

All are ≤ 8 words and go through `typeset()` where rendered as text.

## 7. Privacy note rewrite (`docs/privacy.pl.md`, also served at `/prywatnosc`)

- First line: `[← Wróć do gry](/)`.
- Replace L11-12 with a conditional section, and keep a "Na tej stronie nie ma reklam." variant in `<!-- no-ads -->`.
- **Reklamy (`<!-- ads -->`):**
  - Google AdSense, only on the main menu, lobby, results and spectator view; never during play.
  - Only non-personalised ads (no profiling); requests are tagged with age protections for teenagers.
  - Google processes the IP address and device data as an independent controller; link `https://policies.google.com/technologies/partner-sites`.
  - On first visit in the EEA, Google's certified consent window (TCF) appears. The decision is stored by Google in **cookies on this site** (an exception to "localStorage, not cookies"). It can be changed with "Zgody reklamowe" in the main menu.
  - Ad blockers do not affect the game.
  - Schools can ask the operator for an ad-free address: `{{site.adFreeNote|…}}`.
- **Pokoje publiczne:** private by default. If the host makes a room public, the host nickname, level, mode, difficulty and player count are visible to anyone in the room browser.
- **Widzowie:** spectators see nicknames and live statistics.
- **Pamięć przeglądarki:** add the local profile and stats, the intro and station-help seen flags, the dismissed message (MOTD), and difficulty progress.
- **IP:** still only in memory for abuse limits; Caddy now passes the real client address. Not stored or logged.
- **Administrator:** `{{operator.name|[do uzupełnienia w config.json]}}`, `{{operator.contact|…}}`, `{{operator.hosting|…}}`.

## 8. Docs and rules updates

- **`docs/deploy.md`:**
  - Delete the stale TLS/DOMAIN text (L3-8, 20-23, 30-31, 37-45, 63, 140-141).
  - New topology diagram: browser → TLS proxy → Caddy (static, headers) → server (shell, api, ws).
  - Config section: table of every `config.json` key with default, hot-reload yes/no and meaning; `CONFIG_PATH`, `ADS_ENABLED`, `TRUSTED_PROXIES`; reload commands; `config:check`.
  - Header ownership table and CSP modes.
  - Replace the XFF claim (L108-109) with the X-Real-IP / `trusted_proxies` text.
  - Update the local production-like recipe.
  - "AdSense operator checklist":
    - (1) an AdSense account, with the **root domain `drkp.dev`** added as the site (AdSense accepts only root domains since March 2023);
    - (2) `ads.txt` line on `https://drkp.dev/ads.txt`, plus `subdomain=bronsie.drkp.dev` only if the seller differs; our `/ads.txt` comes from `ads.adsTxt`;
    - (3) verification on the root site, or `ads.verification=true` if the game runs on the root;
    - (4) Privacy & messaging: a European regulations message in Polish for the site, privacy URL `https://bronsie.drkp.dev/prywatnosc`, **floating revocation link off**;
    - (5) Auto ads and overlay formats (anchor, vignette) **off**;
    - (6) create fixed-size display units 160×600 and 728×90 and copy the slot ids;
    - (7) set `ads.domains` and `enabled: true`; run `config:check`; run the smoke test with `--strict`;
    - (8) a device-matrix row with ads on.
- **`agents/architecture.md`:**
  - L43-49 routes: add `/` shell, `/ads.txt`, `/prywatnosc`, `/api/config`.
  - L60 "Exposed only behind Caddy": now all non-asset paths.
  - Config section.
  - L95 privacy: the ads exception and the rule that the public config subset is a separate schema.
- **`agents/design-rules.md`** §5 and §10:
  - Ads only on menu, lobby, results and spectator; never during play, briefing, overlays or dialogs, and never on phones.
  - In a "Reklama" rail with the token frame; ≥ `--space-ad-gap` from any control.
  - Creatives are third-party (exempt from tokens and the one-yellow rule, but the frame is not).
  - The MOTD banner is never yellow.
  - Checklist row "Ads ≥ 150 px from controls; none in play".
- **`agents/game-feel.md`:** a note that ads have no cues (policy).
- **`agents/glossary.md`:**
  - `Konfiguracja serwera` → `serverConfig` / `config.json`
  - `Konfiguracja publiczna` → `publicConfig`
  - `Komunikat redakcji` → `motd`
  - `Flaga funkcji` → `featureFlag`
  - `Reklama` / `miejsce reklamy` → `ad` / `adPlacement`
  - `Zgody reklamowe` → `adConsent`
  - `Strona prywatności` → `privacyPage`
- **`docs/implementation-plan.md`:**
  - Stage 7 tasks S7-E01..E11.
  - Decision log rows: server-rendered shell; config.json, hot reload and env precedence; AdSense (off by default, placements, NPA, age treatment, Google CMP, strict nonce CSP and relaxed Referrer-Policy only with ads, no runtime dependency, ≈2 KB client); X-Real-IP / `trusted_proxies`; MOTD runtime text exception; `/prywatnosc` rendered from the doc.
- **`docs/performance.md`:** budgets and perf e2e run with ads off; Google JS is outside the budget and loads only on ad screens.
- **README:** one line on `config/config.json`.

## 9. Tests

**Unit and server tests** (literal design values)

`apps/server/src/config.test.ts`:
- `parseConfigText('{}')` → `ok`, with:
  - `ads.enabled === false`, `ads.ageTreatment === 'teen'`, `ads.adsTxt` `[]`;
  - `features` `{roomBrowser:true, versus:true, spectators:true, intro:true}`;
  - `rooms.maxRooms === 300`, `rooms.defaultDifficulty === 'normal'`, `motd === null`.
- `{"ads":{"enabeld":true}}` → error containing `enabeld`.
- `{"ads":{"enabled":true}}` → error at `ads.client`.
- A valid ads block parses, and `domains: ["Bronsie.DRKP.dev"]` becomes `['bronsie.drkp.dev']`.
- An `adsTxt` line containing `"\n"` or `<html>` is rejected.
- A MOTD text of 141 chars is rejected; 140 is accepted.
- `rooms.maxRooms: 5001` is rejected.
- A `csp.extra` with `"img-src": ["javascript:"]` is rejected.
- With overrides `{adsEnabled:false}`, a file with `enabled:true` and no client is valid with `enabled false`.
- Store with fake `readFile`/`watchDir`/`setTimer`:
  - a valid change gives `revision` 1, listener `changed` `['ads.enabled']`;
  - invalid JSON keeps `get()`, returns `{ok:false}`, revision stays 1;
  - a missing file keeps the current config;
  - two watch events within 250 ms trigger one reload;
  - events for another filename are ignored;
  - `close()` unsubscribes the watcher;
  - startup with an invalid file throws `ConfigError`.
- `changedPaths({a:{b:1,c:2}},{a:{b:1,c:3}}) → ['a.c']`.

`config.watch.test.ts` (integration, real `fs.watch` in `mkdtemp`): write, then rename-over, then poll until `revision === 1` within 2 s.

`apps/server/src/public-config.test.ts`:
- `toPublicConfig` defaults deep-equal `{revision:0, siteOrigin:null, features:{…true}, defaultDifficulty:'normal', motd:null, ads:{enabled:false}}`.
- Ads for host `bronsie.drkp.dev` give `enabled:true` with slots and `ageTreatment 'teen'`.
- Host `localhost` gives `{enabled:false}`.
- `adsCspReady:false` gives `{enabled:false}`.
- MOTD with `until` in the past gives null; `from` in the future gives null.
- `roomSettings().maxRooms === 300`.

`packages/shared/src/public-config.test.ts`:
- `DEFAULT_PUBLIC_CONFIG` parses.
- `{enabled:true}` without a client fails.
- Partial slots are OK.
- `normalizeHost('BRONSIE.drkp.dev:443') === 'bronsie.drkp.dev'`, `normalizeHost('[::1]:3000') === '::1'`, `normalizeHost('') === null`.
- `hostAllowed('drkp.dev', ['bronsie.drkp.dev']) === false`.

`shell/csp.test.ts`:
- `buildCsp({mode:'base', nonce:'x'})` equals the exact Caddyfile:21 string.
- Ads mode contains `script-src 'nonce-abc' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval' https: http:`, `frame-src https:`, `object-src 'none'`, `frame-ancestors 'none'`.
- `extra['img-src']=['https://example.org']` appears in both modes.
- `adsExtra` appears only in ads mode.
- `shellHeaders('ads')['Referrer-Policy'] === 'strict-origin-when-cross-origin'`; base gives `'no-referrer'`.

`shell/render-shell.test.ts`:
- Three placeholders are all replaced.
- The meta tag is present only with `adsAccount`.
- A MOTD text containing `</script><script>` round-trips through `jsonForHtml`, and the HTML contains no `</script><script>`.
- `createNonce` gives 24 base64 chars for 16 bytes.

`shell/markdown-lite.test.ts`: headings, list, table, bold, `<script>` escaped, `javascript:` link dropped, ads block toggled, `{{operator.name|X}}` gives the value or `X`.

`routes/shell.test.ts` (`app.request`):
- `GET /` with Host `bronsie.drkp.dev` and ads on:
  - 200 `text/html`, CSP has `'strict-dynamic'`;
  - the header nonce equals the body nonce, and two requests have different nonces;
  - meta `ca-pub-1234567890123456` present;
  - `Cache-Control: no-store`.
- Host `localhost`: base CSP, `no-referrer`, no meta.
- `ads.verification:true, enabled:false` on `bronsie.drkp.dev`: meta present, base CSP.
- `GET /lobby` gives html. `GET /missing.js` gives 404. `GET /api/nope` gives 404 JSON (not html). `GET /index.html` gives html.
- No template gives 404.
- `GET /ads.txt` gives `"google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n"` `text/plain`; empty gives 404.
- `GET /prywatnosc` contains the operator name; the ads block only appears when enabled.
- After `store.reload` turning ads off, the next `GET /` uses base CSP.

`routes/api.test.ts`: `GET /api/config` gives 200 and parses; health includes `config:{source:'defaults', revision:0}`.

`limits.test.ts`: per-address limiting via `x-real-ip`, and a new test that `X-Forwarded-For` is ignored.

`tools/deploy/caddyfile.test.ts`:
- The Caddyfile `?Content-Security-Policy` value equals `buildCsp({mode:'base', nonce:null})`.
- It contains `header_up X-Real-IP {client_ip}` and `trusted_proxies`.
- `@backend` is unchanged.

`tools/deploy/config-schema.test.ts`: the committed `config/config.schema.json` equals the generated one, and `config/config.example.json` parses.

**Client unit tests**
- `ads/ads-model.test.ts`:
  - `adEligible({screen:'game', levelEnded:false, spectating:false}) === false`;
  - `({screen:'game', levelEnded:true}) === true`; `mainMenu` and `lobby` true; `briefing` false;
  - `ageTreatmentAttributes('teen')` deep-equals `{'data-tag-for-age-treatment':'2'}`;
  - `loaderUrl('ca-pub-1234567890123456')` ends with `client=ca-pub-1234567890123456`;
  - `adsActiveHere` is false for `localhost` when domains are `['bronsie.drkp.dev']`.
- `ads/adsense.test.ts` with a fake document:
  - one script element after 3 calls;
  - `requestNonPersonalizedAds === 1` before load;
  - `onerror` gives state `blocked`;
  - `pushSlot` twice on the same element pushes once.
- `store/public-config.test.ts`: embedded JSON parsed; invalid JSON gives null; a failed refresh keeps the previous config.
- `screens/menu/motd-model.test.ts`: a dismissed id hides; a new id shows.

**e2e**
- **`e2e/ads.spec.ts`:**
  - Setup: `page.route('**/api/config')` serves an ads-enabled fixture with `domains:['localhost']`. `page.route('https://pagead2.googlesyndication.com/**')` serves a stub that marks `ins` as filled with a 160×600 or 728×90 box.
  - Desktop at 1366×768: the menu rail is visible, and the rectangle distance from the rail to every visible `button, a[href], input, select` outside `dialog` is ≥ 150.
  - The lobby banner obeys the same distance.
  - Starting a level (helpers): `ins.adsbygoogle` count is 0 and `window.adsbygoogle.pauseAdRequests === 1`.
  - Results at 1366 show no rail (below 1780).
  - Adblock (`route.abort()`): no rail and no console errors from our origin.
  - Mobile project: no rail anywhere.
- **`e2e/config.spec.ts`:** a routed MOTD shows, the dismiss survives a reload, and a new id shows again.
- Flag checks are added by each owning cluster (E11).
- Perf e2e is unchanged (ads off).

## 10. Cross-cluster integration (feature flags, shared files)

- **Server:** `RegistryOptions.settings()` is consumed by:
  - the room browser: `GET /api/rooms` returns `404 {error:'disabled'}` when `features.roomBrowser` is false, and `setVisibility('public')` returns `featureDisabled`;
  - versus: `setMode('versus')` and start of a versus room return `featureDisabled`;
  - spectators: a spectator join returns `featureDisabled`;
  - difficulty: new rooms start at `settings().defaultDifficulty`.
- Flags gate **entry points only**. Running matches and rooms keep their mode when a flag flips at runtime.
- **Client:** `useFeature('roomBrowser' | 'versus' | 'spectators' | 'intro')` hides the entry points. `intro` controls auto-play before training and the menu entry.
- **Ads:**
  - The spectator cluster supplies `spectating` to `useAdRequestPause` and mounts `<AdSlot placement="spectator"/>`.
  - The UI cluster's 'O grze' screen links to `/prywatnosc` and adds its link to `MenuFooter`.
- **Files several clusters touch:** `MainMenu.tsx`, `Lobby.tsx`, `ResultsPlate.tsx`, `App.tsx`, `pl.ts`, `protocol.ts` (`errorCodeSchema`, `PROTOCOL_VERSION`), `registry.ts` (options), `ws.ts`, `routes/api.ts`, `tokens.css`. E keeps its additions to self-contained components (`screens/menu/*`, `ads/*`) plus one-line mounts.

## 11. Sources (researched 2026-10-13)

- AdSense CSP, "we only support strict CSP", nonce + `'strict-dynamic'` policy: https://support.google.com/adsense/answer/16283098 ; https://csp.withgoogle.com/docs/strict-csp.html ; https://web.dev/articles/strict-csp
- Certified TCF CMP required in EEA/UK (16 Jan 2024) and Switzerland (31 Jul 2024): https://support.google.com/adsense/answer/13554116
- European regulations message (privacy-policy URL; the message may not show unless Referrer-Policy allows cross-origin, e.g. `strict-origin-when-cross-origin`): https://support.google.com/adsense/answer/10960768 ; https://support.google.com/adsense/answer/10924669
- Revocation link required; `googlefc.showRevocationMessage` via `callbackQueue` `CONSENT_DATA_READY`: https://support.google.com/adsense/answer/10959060 ; https://developers.google.com/funding-choices/fc-api-docs
- `requestNonPersonalizedAds` and `pauseAdRequests`: https://support.google.com/adsense/answer/9042142 ; https://support.google.com/admanager/answer/7678538
- Account-level NPA control removed May 2025: https://support.google.com/adsense/answer/16278928 ; https://ppc.land/google-kills-non-personalized-ads-control-in-european-settings/
- Age treatment (TFAT replaces TFUA/TFCD; `data-tag-for-age-treatment` 1 = child, 2 = teen): https://support.google.com/adsense/answer/9009582 ; https://support.google.com/adsense/answer/17042704 ; https://ppc.land/googles-new-tfat-signal-kills-tfcd-and-tfua-and-finally-adds-a-teen-tier/
- ads.txt on subdomains (root file + `subdomain=`): https://support.google.com/adsense/answer/9785052
- Root domains only as AdSense sites (since March 2023): https://support.google.com/adsense/answer/12170421
- Verification by meta tag `google-adsense-account`: https://support.google.com/adsense/answer/9130038
- Game pages, 150 px from game and controls; accidental clicks: https://support.google.com/adsense/answer/2768340 ; https://support.google.com/adsense/answer/1346295
- Vite `html.cspNonce`: https://github.com/vitejs/vite/pull/16052 ; https://github.com/vitejs/vite/issues/20531
- Caddy `?` header defaults are deferred and keep upstream values: https://caddyserver.com/docs/caddyfile/directives/header
- Zod 4 `.default` short-circuits, so nested objects use `.prefault`: https://www.mintlify.com/colinhacks/zod/migration/v4-changelog


## Contract changes

- NEW packages/shared/src/csp-nonce.ts: CSP_NONCE_PLACEHOLDER = '__REDAKCJA_CSP_NONCE__' (imported by apps/client/vite.config.ts and the server shell).
- NEW packages/shared/src/public-config.ts, exported from index.ts: publicConfigSchema {revision, siteOrigin, features, defaultDifficulty, motd, ads (discriminated on enabled)}; featureFlagSchema/featureFlagsSchema with DEFAULT_FEATURE_FLAGS (all true); adPlacementSchema ('menu'|'lobby'|'results'|'spectator'); adClientSchema; adSlotIdSchema; adAgeTreatmentSchema ('child'|'teen'|'unspecified'); motdSchema; hostnameSchema; DEFAULT_PUBLIC_CONFIG; PUBLIC_CONFIG_ELEMENT_ID = 'redakcja-config'; MOTD_MAX_CHARS = 140; AD_DOMAINS_MAX = 16; normalizeHost(); hostAllowed().
- publicConfigSchema.defaultDifficulty depends on difficultySchema in packages/shared/src/domain.ts, owned by the difficulty cluster. Shared dependency.
- protocol.ts errorCodeSchema += 'featureDisabled', plus pl.errors.featureDisabled. This is a breaking server→client enum change, so PROTOCOL_VERSION goes 2→3 once for all of Stage 7. Coordinate with the room-browser, versus, spectator, difficulty and roles clusters, which also change the wire format.
- REST: new GET /api/config (chained in routes/api.ts, typed through AppType/hc) returning PublicConfig computed per Host header. GET /api/health gains config: {source: 'file'|'defaults', revision: number}.
- New non-API HTTP routes served by the Bun server: GET / and every extension-less SPA path render the HTML shell (per-request nonce, CSP, Referrer-Policy, COOP, Cache-Control no-store, embedded <script id="redakcja-config" type="application/json">, optional google-adsense-account meta); GET /ads.txt (from config.ads.adsTxt, 404 when empty); GET /prywatnosc (rendered from docs/privacy.pl.md).
- apps/server RegistryOptions gains settings?: () => RoomSettings {maxRooms, features: FeatureFlags, defaultDifficulty}. The room browser, versus, spectators and difficulty clusters read their feature flag and default difficulty from it. options.maxRooms still takes precedence for tests.
- apps/server env.ts gains optional CONFIG_PATH, ADS_ENABLED (z.stringbool kill switch, applied before validation), SHELL_HTML_PATH and PRIVACY_MD_PATH. startServer(env, options?: {config?: ConfigStore; shell?: ShellAssets}). createApp deps gain optional config, configMeta, shell and adsCspReady.
- NEW server-side serverConfigSchema (apps/server/src/config.ts, z.strictObject) with sections site, features, motd, rooms, ads and csp. Committed config/config.example.json and generated config/config.schema.json; config/config.json is gitignored.
- Client IP contract: Caddy sets X-Real-IP from {client_ip} (trusted_proxies {$TRUSTED_PROXIES:private_ranges}, trusted_proxies_strict). The server reads only X-Real-IP or the socket address through the new exported clientAddress(c) in apps/server/src/client-address.ts; ws.ts stops parsing X-Forwarded-For. The room-browser throttle must reuse this helper.
- Caddyfile header ownership: CSP, Referrer-Policy and COOP become '?' defaults so the server's values win on the shell. The catch-all handle now proxies to the server. A new @static matcher serves existing files, and handle_errors 502/503/504 falls back to the static index.html. A TRUSTED_PROXIES env var is added to the web service.
- vite.config.ts: html.cspNonce = CSP_NONCE_PLACEHOLDER, so dist/index.html now carries nonce attributes and <meta property="csp-nonce">. The dev and preview proxies gain /ads.txt and /prywatnosc.
- Dockerfile server stage copies apps/client/dist/index.html (from client-build) and docs/privacy.pl.md. The server and web images must come from the same build.
- docker-compose: the server mounts ./config:/app/config:ro and sets CONFIG_PATH; web gets TRUSTED_PROXIES.
- Client shared hooks: usePublicConfig store and useFeature(flag) in apps/client/src/store/public-config.ts; <AdSlot placement> in apps/client/src/ads/AdSlot.tsx; adEligible({screen, levelEnded, spectating}). The spectator cluster must supply spectating and mount the spectator AdSlot.
- Design tokens: new --space-ad-gap: 9.5rem in apps/client/src/ui/tokens.css.
- Strings: pl.errors.featureDisabled, pl.menu.motdLabel/motdClose/privacy/adConsent, pl.ads.label.
- No DB schema or migration changes. No content schema changes.

## Cluster tasks (superseded by `tasks.md`)

- **S7-E01 — Shared public-config contract and featureDisabled error code** (S; depends on S7 difficulty enum contract (difficulty cluster: difficultySchema in domain.ts)). packages/shared/src/csp-nonce.ts and public-config.ts (schemas, DEFAULT_FEATURE_FLAGS, DEFAULT_PUBLIC_CONFIG, normalizeHost, hostAllowed, constants), exported from index.ts; errorCodeSchema += 'featureDisabled' with pl.errors string and the coordinated PROTOCOL_VERSION bump; protocol.test.ts and public-config.test.ts; glossary rows (publicConfig, featureFlag, motd, adPlacement). If the difficulty enum has not landed yet, ship without defaultDifficulty and add it in a one-line follow-up. *Done when:* bun run check passes. Tests assert DEFAULT_PUBLIC_CONFIG parses, ads {enabled:true} without a client is rejected, normalizeHost('[::1]:3000') === '::1', and hostAllowed('drkp.dev', ['bronsie.drkp.dev']) === false. pl.errors compiles with the new code.
- **S7-E02 — config.json loader with hot reload (fs.watch on the directory and SIGHUP)** (M; depends on S7-E01). apps/server/src/config.ts (serverConfigSchema with prefault, parseConfigText, applyOverrides, changedPaths, createConfigStore, staticConfigStore, ConfigError); paths.ts; env.ts optional vars; index.ts (exit 1 on an invalid file, SIGHUP reload, close on shutdown); server.ts startServer(env, options); registry settings() getter with hot maxRooms; /api/health config meta; config/config.example.json; config/config.schema.json with generator and freshness test; tools/deploy/config-check.ts and a 'config:check' script; .gitignore and .dockerignore; config.test.ts and config.watch.test.ts. *Done when:* Unit tests with literal defaults pass (maxRooms 300, teen, all features true). Reload keeps the old config on invalid or missing files, debounces at 250 ms, and logs the changed paths. Tests show SIGHUP and watch both reload. Existing server, limits and smoke tests compile unchanged.
- **S7-E03 — GET /api/config and the client public-config store** (S; depends on S7-E02). apps/server/src/public-config.ts (toPublicConfig, adsActiveFor, activeMotd, roomSettings); routes/api.ts .get('/config'); api.test.ts; client net/api.ts fetchPublicConfig via hc; store/public-config.ts (readEmbeddedConfig, refresh with 60 s throttle, useFeature); App.tsx boot refresh; vite proxy entries for /ads.txt and /prywatnosc; unit tests. *Done when:* app.request('/api/config') returns a schema-valid body that is ads-enabled only for configured hosts and drops expired MOTDs. The client falls back to DEFAULT_PUBLIC_CONFIG on fetch failure (unit test). useFeature is exported.
- **S7-E04 — Real client IP behind the external TLS proxy** (S; depends on —). Caddyfile global servers block (trusted_proxies static {$TRUSTED_PROXIES:private_ranges}, trusted_proxies_strict, client_ip_headers) and game_server snippet with header_up X-Real-IP {client_ip}; apps/server/src/client-address.ts; ws.ts uses it; limits.test.ts switched to x-real-ip, plus an 'ignores X-Forwarded-For' test; compose TRUSTED_PROXIES on web; deploy.md client-address section. *Done when:* The limits tests pass. A forged X-Forwarded-For no longer changes the limiter key. caddy validate accepts the Caddyfile (manual or CI with the caddy binary).
- **S7-E05 — Server-rendered HTML shell with config-driven CSP and ads.txt** (M; depends on S7-E03). vite.config.ts html.cspNonce; apps/server/src/shell/assets.ts, render-shell.ts, csp.ts; routes/shell.ts (/, SPA fallback, /index.html, /ads.txt, reserved-path and extension 404s); app.ts mounts it last; adsCspReady wiring; csp, render and route tests; tools/deploy/caddyfile.test.ts (base CSP parity). *Done when:* Route tests prove: ads host gets a strict-dynamic CSP whose nonce matches the body and changes per request; other hosts get the byte-identical base CSP; verification meta only when configured; /api/unknown is not HTML; ads.txt is text/plain. bun run build output contains the placeholder.
- **S7-E06 — Deploy wiring: Dockerfile, Caddyfile routing, compose, smoke test** (M; depends on S7-E04, S7-E05). Dockerfile server stage copies dist/index.html and docs/privacy.pl.md; full Caddyfile (security_headers snippet with ? defaults, @static, catch-all to the server, handle_errors 502-504 static fallback); compose config mount and CONFIG_PATH; .env.example cleanup (drop DOMAIN, add TRUSTED_PROXIES); tools/smoke/smoke.ts new checks (api/config, embedded config, CSP mode vs config, nonce rotation, ads.txt not HTML, /prywatnosc, static manifest); smoke.test.ts stand-in and an ads-mode run; local production-like recipe updated. *Done when:* smoke.test.ts passes in both base and ads mode. docker compose up --build plus bun run smoke -- http://localhost:8080 --strict passes locally. Stopping the server container still serves the menu shell (manual check recorded in the commit body).
- **S7-E07 — MOTD banner in the main menu** (S; depends on S7-E03). screens/menu/MotdBanner.tsx and .module.css; motd-model.ts with tests; dismissed id in localStorage via safe-storage; pl.menu.motdLabel and motdClose; MainMenu mount; e2e/config.spec.ts (routed /api/config); design checklist in the commit body. *Done when:* The banner shows operator text with info or warning styling (tokens only, never yellow). Dismiss persists per id across a reload and a new id reappears (e2e). It is readable at 640x360 and reachable by keyboard, gamepad and touch.
- **S7-E08a — AdSense client core: loader, AdSlot, pause guard** (M; depends on S7-E03, S7-E05). apps/client/src/ads/ads-model.ts, placements.ts, adsense.ts (lazy loader with NPA before load, timeout and blocked state, pushSlot guard, setAdRequestsPaused, openConsentSettings), AdSlot.tsx and .module.css, use-ad-pause.ts mounted in App.tsx; --space-ad-gap token; pl.ads.label; unit tests with a fake document. *Done when:* Unit tests pass (adEligible table, teen attribute value '2', single script after 3 calls, blocked on error, single push under StrictMode). The menu chunk stays under the perf budget (bun run perf:budget).
- **S7-E08b — Ad placements, consent link and e2e guards** (M; depends on S7-E08a). AdSlot in MainMenu (left rail), Lobby (below the footer) and ResultsPlate (side rail at 1780 px and wider); exported for the spectator cluster; MenuFooter with 'Zgody reklamowe'; e2e/ads.spec.ts (stubbed Google script, 150 px gap, none in game, pauseAdRequests 1, silent adblock, none on mobile); design-rules.md ad rules and checklist row; game-feel.md 'no cues for ads'. *Done when:* e2e ads.spec passes on the desktop and mobile projects. With no config, no ad element or Google request appears in any existing e2e run. Design-rules amendment lands in the same commit.
- **S7-E09 — Privacy page at /prywatnosc and privacy note rewrite** (M; depends on S7-E05, S7-E08b). apps/server/src/shell/markdown-lite.ts with tests; GET /prywatnosc route (base CSP, operator vars, ads and no-ads blocks); docs/privacy.pl.md rewrite (ads via Google, NPA and teen treatment, CMP cookies, revocation link, public rooms, spectators, new localStorage keys, real IP handling, operator placeholders); MenuFooter 'Prywatność' link; vite proxy entry. *Done when:* /prywatnosc renders the doc with the ads section only when ads are enabled (route test). The smoke check passes. The privacy text matches the shipped behaviour (reviewer checklist in the commit body).
- **S7-E10 — Docs, rules and plan for config, ads and deploy** (S; depends on S7-E02, S7-E06, S7-E08b, S7-E09). docs/deploy.md (topology, config table with hot-reload column, reload commands, header ownership, CSP modes, AdSense operator checklist incl. root-domain site, ads.txt on drkp.dev, CMP message with Polish text and the floating link off, Auto ads off; trusted proxies; remove stale TLS and DOMAIN text); agents/architecture.md routes, config and privacy; agents/glossary.md; docs/implementation-plan.md Stage 7 E tasks and Decision log rows; docs/performance.md ads note; README line. *Done when:* Docs match the code: every config key is documented with its default, and the Decision log has entries for the shell, config and precedence, AdSense, X-Real-IP, the MOTD exception and the privacy page. bun run check passes.
- **S7-E11 — Feature-flag enforcement integration** (S; depends on S7-E02, S7-E03, room browser task (cluster F), versus and spectator tasks (their clusters), intro task (UI/tutorial cluster)). Checklist executed with the owning clusters: GET /api/rooms returns 404 when roomBrowser is off; setVisibility('public'), setMode('versus') and spectator join return featureDisabled when their flags are off; new rooms use settings().defaultDifficulty; client entry points are hidden through useFeature; one test per flag (server reject plus client hide via a routed /api/config). *Done when:* Each flag set to false in a staticConfigStore makes the corresponding server action return featureDisabled, and the client hides its entry point. Running matches are unaffected by a runtime flip (test).

## Risks

- The page now depends on the Bun server. The handle_errors 502/503/504 static fallback is a mitigation, but if the server and web images come from different builds, the shell references asset hashes that do not exist. Mitigation: always run docker compose up -d --build for both services; the smoke test already loads every linked asset.
- The external TLS proxy might inject or overwrite CSP, Referrer-Policy or COOP. That would break the nonce policy or the consent message. Verify on the real domain with bun run smoke --strict (CSP-mode and nonce checks).
- Google's strict policy needs 'unsafe-eval' and https: for img, frame, connect, style and font when ads are on. This weakens the XSS posture, but only for hosts in ads.domains. The base policy stays byte-identical to today, and a Caddyfile test enforces that.
- Vite 8 (rolldown) html.cspNonce must put the nonce on the entry script, modulepreload links and dynamically preloaded chunks. If any game chunk loads without trust under 'strict-dynamic', the game fails to start only on ad-enabled hosts. vite preview has no CSP, so e2e cannot catch this. A manual production-like run with ads on and the console watched for securitypolicyviolation is mandatory before enabling ads.
- AdSense registers only root domains (drkp.dev) since March 2023, and ads.txt is read from https://drkp.dev/ads.txt. If the user does not control drkp.dev, or its homepage, verification and ads.txt cannot be satisfied from this repo.
- Minors: under Polish law digital consent requires age 16. Consent from younger players for cookies (needed even for non-personalised ads) is legally questionable. The CMP also writes consent cookies on our domain, which contradicts the old 'no cookies' promise. Recommend ads off for school use and an ad-free domain. Legal review is outside engineering scope.
- AdSense policy exposure: thin-content SPA site review; accidental clicks near game controls (mitigated by viewport gates and a 150 px e2e check); Auto ads, anchor and vignette formats switched on in the AdSense UI could overlay gameplay. The client can only pause requests, so the operator checklist must keep them off.
- Third-party JS stays resident after the first ad screen, including during a later match: memory, timers, main-thread work on UHD 620 and phones. Phones never load it (no placement matches). A device-matrix row with ads on is needed.
- Age-treatment and TFAT signals were announced in May 2026 and are still evolving. The data-tag-for-age-treatment values ('1' child, '2' teen) come from secondary summaries of Google help pages. Verify against AdSense help 9009582 and 17042704 before enabling.
- fs.watch on bind mounts is unreliable on Docker Desktop (macOS/Windows) and some network filesystems, and Bun may ignore persistent:false. SIGHUP is the documented fallback, and tests must call store.close() to avoid hanging.
- Feature flags flipped at runtime gate only new actions. Operators may expect running versus or spectator sessions to stop, so this must be documented.
- Merge conflicts: MainMenu.tsx, Lobby.tsx, ResultsPlate.tsx, App.tsx, pl.ts, protocol.ts (errorCodeSchema, PROTOCOL_VERSION), registry.ts options, ws.ts, routes/api.ts and tokens.css are touched by several Stage 7 clusters. E keeps its changes to new files plus one-line mounts.
- The Referrer-Policy change to strict-origin-when-cross-origin (ads mode only) sends our origin on cross-origin requests. This is required for the Google consent message to display.

## Open points (defaults chosen)

- The AdSense loader is injected lazily by the client on the first ad screen, not in <head>, so a reload straight into a match never loads Google JS and the CMP never covers gameplay. Default: lazy. The <head> carries only the verification meta.
- Default age treatment is 'teen' (data-tag-for-age-treatment="2"), plus requestNonPersonalizedAds = 1 on every page. 'child' is available in config for stricter school deployments. Verify the attribute name and values in the AdSense help before enabling.
- COOP stays 'same-origin' in ads mode. Switch the single constant to 'same-origin-allow-popups' only if ad click-through or the CMP misbehaves in testing.
- base-uri stays 'self' in both modes. Google's sample uses 'none'; we have no <base> tag, so this is equivalent.
- An invalid config.json at startup exits with code 1, while an invalid file at reload keeps the old config. The alternative of starting with defaults was rejected because it would silently flip flags.
- Env precedence: process settings stay env-only. config.json holds product settings. The only overlapping env var is the ADS_ENABLED kill switch, which always wins. BRIEFING_MS stays env-only as the e2e knob.
- Ad placements and viewport gates: menu has a 160x600 left rail at 1180x680 and above; lobby has a 728x90 banner below the footer at 800x600 and above; results has a 160x600 side rail at 1780x700 and above; spectator has a 728x90 unit at 1280x720 and above, positioned by the spectator cluster. Phones never get ads. Laptops therefore see no results ads, which favours policy compliance over revenue.
- The MOTD shows only in the main menu, is capped at 140 characters, and can be scheduled with from/until. It is operator-authored Polish text outside pl.ts, which is recorded as a Decision-log exception.
- The privacy page is server-rendered at /prywatnosc from docs/privacy.pl.md (single source, with conditional ads blocks and operator variables). The 'O grze' screen links to it instead of duplicating the text in pl.ts.
- TRUSTED_PROXIES defaults to private_ranges, which assumes the TLS proxy runs on the same host and reaches Caddy over the docker bridge. The user must confirm where the proxy runs; if it is elsewhere, set its IP/32.
- Per-IP rate limits stay code constants in limits.ts, not config.json. Only maxRooms is hot-configurable.
- Consent revocation uses our own 'Zgody reklamowe' footer link (googlefc.showRevocationMessage). Google's floating link must be switched off in the AdSense UI because it would overlay the game. Enabling 'Limited ads' for users without consent is recommended as an operator setting.
- /api/health exposes config {source, revision}, so operators can confirm a reload took effect. Both values are non-sensitive.
- config.json gives no way to add Google-specific CSP hosts, because the strict nonce policy makes host lists unnecessary. csp.extra and csp.adsExtra are kept as an escape hatch with validated sources only.
