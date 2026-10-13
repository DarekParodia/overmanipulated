// Checks a config.json before it goes live: `bun run config:check -- config/config.json`.
// Prints OK and the effective config (defaults filled in, ADS_ENABLED applied as the server
// would) and the public config clients get (`GET /api/config`) on each ads host and on any other
// host, or the validation errors with exit code 1. Run it before saving the file on the
// server: the running server keeps its old config when a reload fails, but says so only in its log.
import { readFileSync } from 'node:fs';
import { type ConfigOverrides, parseConfigText } from '../../apps/server/src/config.ts';
import { readEnv } from '../../apps/server/src/env.ts';
import { DEFAULT_CONFIG_PATH } from '../../apps/server/src/paths.ts';
import { toPublicConfig } from '../../apps/server/src/public-config.ts';

export type CheckResult = { ok: boolean; lines: string[] };

/** Stands for every host outside ads.domains (where ads are always off). */
const OTHER_HOSTS = 'any other host';

export function checkConfig(
  text: string,
  overrides: ConfigOverrides = {},
  nowMs: number = Date.now(),
): CheckResult {
  const result = parseConfigText(text, overrides);
  if (!result.ok) {
    return {
      ok: false,
      lines: ['config.json is INVALID; the server would refuse it:', result.error],
    };
  }
  const { config } = result;
  const ads = config.ads;
  const lines = [
    'config.json OK',
    `rooms: maxRooms ${config.rooms.maxRooms}, new rooms start on ${config.rooms.defaultDifficulty}`,
    `features: ${Object.entries(config.features)
      .map(([flag, on]) => `${flag} ${on ? 'on' : 'off'}`)
      .join(', ')}`,
    `motd: ${config.motd === null ? 'none' : `"${config.motd.id}" (${config.motd.tone})`}`,
    ads.enabled
      ? `ads: ON (${ads.mode}, ${ads.ageTreatment}) on ${ads.domains.join(', ')}; signed off by ${ads.signOff?.by} on ${ads.signOff?.date}`
      : `ads: off${ads.verification ? ' (verification meta tag only)' : ''}`,
  ];
  if (overrides.adsEnabled !== undefined) {
    lines.push(`ADS_ENABLED=${overrides.adsEnabled} from env applied`);
  }
  lines.push('effective config:', JSON.stringify(config, null, 2));
  // What GET /api/config serves now (MOTD window applied), revision 0 as after a restart.
  for (const host of [...ads.domains, OTHER_HOSTS]) {
    const publicConfig = toPublicConfig(config, {
      host: host === OTHER_HOSTS ? null : host,
      nowMs,
      revision: 0,
      adsCspReady: true,
    });
    lines.push(`public config for ${host}: ${JSON.stringify(publicConfig)}`);
  }
  return { ok: true, lines };
}

if (import.meta.main) {
  const path = process.argv[2] ?? DEFAULT_CONFIG_PATH;
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  const result = checkConfig(text, { adsEnabled: readEnv().ADS_ENABLED });
  for (const line of result.lines) {
    (result.ok ? console.log : console.error)(line);
  }
  process.exit(result.ok ? 0 : 1);
}
