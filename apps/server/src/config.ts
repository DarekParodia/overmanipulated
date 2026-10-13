// Server config.json (Stage 7, M5): product and runtime settings the operator edits on the host
// (rooms, feature flags, message of the day, ads, CSP extras). It is validated with a strict zod
// schema, hot-reloads on file changes and on SIGHUP, and an invalid file never replaces a
// working config. Process and infrastructure settings (port, database path) stay in env.ts.
// The client only ever sees the public subset (`publicConfigSchema` in @redakcja/shared).
import { existsSync, readFileSync, watch as watchFs } from 'node:fs';
import { basename, dirname } from 'node:path';
import {
  adAgeTreatmentSchema,
  adClientSchema,
  adModeAllowed,
  adModeSchema,
  adSlotsSchema,
  DEFAULT_AD_AGE_TREATMENT,
  DEFAULT_AD_MODE,
  DEFAULT_DIFFICULTY,
  DEFAULT_FEATURE_FLAGS,
  difficultySchema,
  hostnameSchema,
  motdIdSchema,
  motdSchema,
  motdToneSchema,
  siteOriginSchema,
} from '@redakcja/shared';
import { z } from 'zod';
import {
  AD_DOMAINS_MAX,
  AD_SIGN_OFF_BY_MAX_CHARS,
  ADS_TXT_LINE_MAX_CHARS,
  ADS_TXT_MAX_LINES,
  CONFIG_RELOAD_DEBOUNCE_MS,
  CSP_EXTRA_MAX_SOURCES,
  MAX_ROOMS,
  MAX_ROOMS_CEILING,
  OPERATOR_LINE_MAX_CHARS,
  OPERATOR_NAME_MAX_CHARS,
} from './limits.ts';
import { log } from './log.ts';

// --- Schema --------------------------------------------------------------------------------

/** Fetch directives `csp.extra` / `csp.adsExtra` may extend (never the navigation ones). */
const cspDirectiveSchema = z.enum([
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'media-src',
  'connect-src',
  'frame-src',
  'worker-src',
]);
/** One CSP source: a keyword, a scheme, or an https host with an optional port and path. */
const cspSourceSchema = z
  .string()
  .regex(
    /^(?:'(?:self|unsafe-inline|unsafe-eval|wasm-unsafe-eval|strict-dynamic)'|(?:https|wss|data|blob):|https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~/-]*)?)$/,
  );
export const cspExtraSchema = z.partialRecord(
  cspDirectiveSchema,
  z.array(cspSourceSchema).max(CSP_EXTRA_MAX_SOURCES),
);

/** ads.txt: a comment, `VARIABLE=value`, or `domain, pubId, DIRECT|RESELLER[, certId]`. One line each. */
const ADS_TXT_LINE =
  /^(?:#[^\r\n]*|[A-Za-z]+=[^\s]+|[a-z0-9.-]+,\s*[^,\s]+,\s*(?:DIRECT|RESELLER)(?:,\s*[A-Za-z0-9]+)?(?:\s*#[^\r\n]*)?)$/i;

const operatorTextSchema = (max: number) => z.string().trim().min(1).max(max);

/**
 * The supervisor or legal sign-off that ads may run for this audience: who signed and when
 * (`YYYY-MM-DD`). `ads.enabled: true` is refused without it, whatever enables ads.
 */
export const adSignOffSchema = z.strictObject({
  by: operatorTextSchema(AD_SIGN_OFF_BY_MAX_CHARS),
  date: z.iso.date(),
});

const isoInstantSchema = z.iso.datetime({ offset: true });

// zod 4: `.default({})` short-circuits (inner defaults would not apply), so nested objects use
// `.prefault({})`, which parses `{}` through the object and fills every inner default.
export const serverConfigSchema = z
  .strictObject({
    /** Editor hint (`./config.schema.json`); ignored by the server. */
    $schema: z.string().optional(),
    site: z
      .strictObject({
        /** Public origin of the site, e.g. `https://bronsie.drkp.dev`. */
        publicOrigin: siteOriginSchema.optional(),
        /** Who runs this server; filled into the privacy page. */
        operator: z
          .strictObject({
            name: operatorTextSchema(OPERATOR_NAME_MAX_CHARS).optional(),
            contact: operatorTextSchema(OPERATOR_LINE_MAX_CHARS).optional(),
            hosting: operatorTextSchema(OPERATOR_LINE_MAX_CHARS).optional(),
          })
          .prefault({}),
      })
      .prefault({}),
    features: z
      .strictObject({
        roomBrowser: z.boolean().default(DEFAULT_FEATURE_FLAGS.roomBrowser),
        versus: z.boolean().default(DEFAULT_FEATURE_FLAGS.versus),
        spectators: z.boolean().default(DEFAULT_FEATURE_FLAGS.spectators),
        intro: z.boolean().default(DEFAULT_FEATURE_FLAGS.intro),
      })
      .prefault({}),
    /** Message of the day in the main menu; `from` / `until` bound when it shows. */
    motd: z
      .strictObject({
        id: motdIdSchema,
        text: motdSchema.shape.text,
        tone: motdToneSchema.default('info'),
        from: isoInstantSchema.optional(),
        until: isoInstantSchema.optional(),
      })
      .nullable()
      .default(null),
    rooms: z
      .strictObject({
        /** Rooms alive at once; read at every room creation, so a reload applies at once. */
        maxRooms: z.number().int().min(1).max(MAX_ROOMS_CEILING).default(MAX_ROOMS),
        /** Difficulty a new room starts at. */
        defaultDifficulty: difficultySchema.default(DEFAULT_DIFFICULTY),
      })
      .prefault({}),
    ads: z
      .strictObject({
        enabled: z.boolean().default(false),
        /** Serve the AdSense verification meta tag on `domains` while ads are still off. */
        verification: z.boolean().default(false),
        mode: adModeSchema.default(DEFAULT_AD_MODE),
        client: adClientSchema.optional(),
        slots: adSlotsSchema.default({}),
        domains: z.array(hostnameSchema).max(AD_DOMAINS_MAX).default([]),
        ageTreatment: adAgeTreatmentSchema.default(DEFAULT_AD_AGE_TREATMENT),
        signOff: adSignOffSchema.optional(),
        adsTxt: z
          .array(z.string().max(ADS_TXT_LINE_MAX_CHARS).regex(ADS_TXT_LINE))
          .max(ADS_TXT_MAX_LINES)
          .default([]),
      })
      .prefault({}),
    csp: z
      .strictObject({ extra: cspExtraSchema.default({}), adsExtra: cspExtraSchema.default({}) })
      .prefault({}),
  })
  .superRefine((config, ctx) => {
    const { ads, motd } = config;
    if ((ads.enabled || ads.verification) && ads.client === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ads', 'client'],
        message: 'ads.client is required when ads.enabled or ads.verification is true',
      });
    }
    if (ads.enabled && ads.signOff === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ads', 'signOff'],
        message: 'ads.enabled needs ads.signOff {by, date}: supervisor or legal sign-off first',
      });
    }
    if (ads.enabled && ads.domains.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ads', 'domains'],
        message: 'ads.enabled needs at least one host in ads.domains',
      });
    }
    if (ads.enabled && Object.keys(ads.slots).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['ads', 'slots'],
        message: 'ads.enabled needs at least one ad slot',
      });
    }
    if (!adModeAllowed(ads.mode, ads.ageTreatment)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ads', 'mode'],
        message: "ads.mode must be 'limited' while ageTreatment is 'teen' or 'child'",
      });
    }
    if (
      motd?.from !== undefined &&
      motd.until !== undefined &&
      Date.parse(motd.from) >= Date.parse(motd.until)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['motd', 'until'],
        message: 'motd.until must be later than motd.from',
      });
    }
  });

export type ServerConfig = z.output<typeof serverConfigSchema>;
export type ServerConfigInput = z.input<typeof serverConfigSchema>;

/**
 * JSON Schema of what an operator writes (the input side, where defaults make keys optional), for
 * the committed config/config.schema.json. Cross-field rules (sign-off, ads mode) are not in it.
 */
export function serverConfigJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(serverConfigSchema, { io: 'input', unrepresentable: 'any' });
}

/** The config a server runs with when there is no config.json. */
export const DEFAULT_SERVER_CONFIG: ServerConfig = serverConfigSchema.parse({});

// --- Parsing -------------------------------------------------------------------------------

/**
 * Env settings that win over config.json. They are applied to the raw JSON before validation, at
 * startup and on every reload, so they can never bypass a schema rule: `ADS_ENABLED=true`
 * without `ads.signOff` is refused like the same line in the file.
 */
export type ConfigOverrides = { adsEnabled?: boolean | undefined };

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export type ParseResult = { ok: true; config: ServerConfig } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `raw` with the env overrides written in; a value of the wrong shape is left for the schema. */
export function applyOverrides(raw: unknown, overrides: ConfigOverrides): unknown {
  if (overrides.adsEnabled === undefined || !isRecord(raw)) return raw;
  const ads = raw.ads === undefined ? {} : raw.ads;
  if (!isRecord(ads)) return raw;
  return { ...raw, ads: { ...ads, enabled: overrides.adsEnabled } };
}

export function parseConfigValue(raw: unknown, overrides: ConfigOverrides = {}): ParseResult {
  const result = serverConfigSchema.safeParse(applyOverrides(raw, overrides));
  return result.success
    ? { ok: true, config: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}

export function parseConfigText(text: string, overrides: ConfigOverrides = {}): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: `config.json: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return parseConfigValue(raw, overrides);
}

/** Dotted paths of every leaf that differs (arrays compare whole), sorted. */
export function changedPaths(prev: unknown, next: unknown, prefix = ''): string[] {
  if (isRecord(prev) && isRecord(next)) {
    const keys = [...new Set([...Object.keys(prev), ...Object.keys(next)])].sort();
    return keys.flatMap((key) =>
      changedPaths(prev[key], next[key], prefix === '' ? key : `${prefix}.${key}`),
    );
  }
  if (JSON.stringify(prev) === JSON.stringify(next)) return [];
  return [prefix === '' ? '(root)' : prefix];
}

// --- Store ---------------------------------------------------------------------------------

export type ConfigSource = 'file' | 'defaults';
export type ConfigMeta = { source: ConfigSource; revision: number };
export type ReloadTrigger = 'signal' | 'watch' | 'manual';
export type ReloadResult = { ok: true; changed: string[] } | { ok: false; error: string };
export type ConfigListener = (config: ServerConfig, changed: string[]) => void;

export type ConfigStore = {
  get(): ServerConfig;
  /** +1 for every reload that changed at least one value; 0 as started. */
  readonly revision: number;
  /** Whether the running config came from the file or from the defaults (no file). */
  readonly source: ConfigSource;
  reload(trigger: ReloadTrigger): ReloadResult;
  subscribe(listener: ConfigListener): () => void;
  /** Stops watching; safe to call twice. */
  close(): void;
};

export type ConfigStoreOptions = {
  path: string;
  overrides?: ConfigOverrides;
  /** File text, or null when it does not exist; throws on other read errors. */
  readFile?: (path: string) => string | null;
  /** Watch the file's directory and reload on changes (default true). */
  watch?: boolean;
  /** Calls `onEvent` with the changed file name (or null) for changes in `dir`; returns a stop. */
  watchDir?: (dir: string, onEvent: (filename: string | null) => void) => () => void;
  /** Debounce timer; returns a cancel. */
  setTimer?: (fn: () => void, ms: number) => () => void;
};

function readFileOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

// fs.watch on the directory, not the file: editors and `cp` save by rename, which a file watch
// would lose. Unreliable on some bind mounts (Docker Desktop, network filesystems), hence SIGHUP.
function watchDirectory(dir: string, onEvent: (filename: string | null) => void): () => void {
  if (!existsSync(dir)) {
    log.info('config directory not found, not watching', { dir });
    return () => {};
  }
  const watcher = watchFs(dir, { persistent: false }, (_event, filename) => {
    onEvent(filename === null ? null : String(filename));
  });
  return () => watcher.close();
}

function startTimer(fn: () => void, ms: number): () => void {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Loads config.json from `options.path` and keeps it current. A missing file means the defaults
 * (plus env overrides); an unreadable or invalid file throws `ConfigError`, so the server refuses
 * to start. Later reloads never throw: a missing or invalid file keeps the running config.
 */
export function createConfigStore(options: ConfigStoreOptions): ConfigStore {
  const { path } = options;
  const overrides = options.overrides ?? {};
  const readFile = options.readFile ?? readFileOrNull;
  const setTimer = options.setTimer ?? startTimer;
  const listeners = new Set<ConfigListener>();

  let text: string | null;
  try {
    text = readFile(path);
  } catch (error) {
    throw new ConfigError(`cannot read ${path}: ${errorText(error)}`);
  }
  const initial =
    text === null ? parseConfigValue({}, overrides) : parseConfigText(text, overrides);
  if (!initial.ok) {
    throw new ConfigError(initial.error);
  }
  let current = initial.config;
  let source: ConfigSource = text === null ? 'defaults' : 'file';
  let revision = 0;
  if (text === null) {
    log.info('config file not found, using defaults', { path });
  } else {
    log.info('config loaded', { path, ads: current.ads.enabled });
  }

  const reload = (trigger: ReloadTrigger): ReloadResult => {
    let next: string | null;
    try {
      next = readFile(path);
    } catch (error) {
      const message = `cannot read ${path}: ${errorText(error)}`;
      log.warn('config reload rejected', { trigger, error: message });
      return { ok: false, error: message };
    }
    if (next === null) {
      log.warn('config file missing, keeping current config', { trigger, path });
      return { ok: false, error: `${path} not found` };
    }
    const parsed = parseConfigText(next, overrides);
    if (!parsed.ok) {
      log.warn('config reload rejected', { trigger, error: parsed.error });
      return { ok: false, error: parsed.error };
    }
    source = 'file';
    const changed = changedPaths(current, parsed.config);
    if (changed.length > 0) {
      current = parsed.config;
      revision += 1;
      log.info('config reloaded', { trigger, changed, revision });
      // Reloads run from a timer or a signal handler: a throwing listener must not crash the
      // server or keep the others from hearing about the new config.
      for (const listener of listeners) {
        try {
          listener(current, changed);
        } catch (error) {
          log.error('config listener failed', { trigger, error: errorText(error) });
        }
      }
    }
    return { ok: true, changed };
  };

  let cancelPending: (() => void) | null = null;
  let stopWatching: (() => void) | null = null;
  const dir = dirname(path);
  const file = basename(path);
  if (options.watch ?? true) {
    const watchDir = options.watchDir ?? watchDirectory;
    try {
      stopWatching = watchDir(dir, (filename) => {
        if (filename !== null && filename !== file) return;
        cancelPending?.();
        cancelPending = setTimer(() => {
          cancelPending = null;
          reload('watch');
        }, CONFIG_RELOAD_DEBOUNCE_MS);
      });
    } catch (error) {
      log.warn('config watch unavailable, reload with SIGHUP', { dir, error: errorText(error) });
    }
  }

  return {
    get: () => current,
    get revision() {
      return revision;
    },
    get source() {
      return source;
    },
    reload,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      cancelPending?.();
      cancelPending = null;
      stopWatching?.();
      stopWatching = null;
    },
  };
}

/** A fixed config with no file behind it (tests, tools); throws `ConfigError` when invalid. */
export function staticConfigStore(input: ServerConfigInput = {}): ConfigStore {
  const parsed = parseConfigValue(input);
  if (!parsed.ok) {
    throw new ConfigError(parsed.error);
  }
  const config = parsed.config;
  return {
    get: () => config,
    revision: 0,
    source: 'defaults',
    reload: () => ({ ok: true, changed: [] }),
    subscribe: () => () => {},
    close: () => {},
  };
}

/** Something that delivers process signals (`process`, or a fake in tests). */
export type SignalSource = {
  on(signal: 'SIGHUP', listener: () => void): unknown;
  off(signal: 'SIGHUP', listener: () => void): unknown;
};

/** Reloads `store` on SIGHUP (`docker compose kill -s SIGHUP server`); returns a stop. */
export function reloadOnSignal(store: ConfigStore, target: SignalSource): () => void {
  const listener = () => {
    store.reload('signal');
  };
  target.on('SIGHUP', listener);
  return () => {
    target.off('SIGHUP', listener);
  };
}
