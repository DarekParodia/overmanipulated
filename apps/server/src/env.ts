import { BRIEFING_DURATION_MS } from '@redakcja/shared';
import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/redakcja.sqlite'),
  /** Dev only: artificial one-way latency added to every message in both directions. */
  DEV_LATENCY_MS: z.coerce.number().int().min(0).max(2000).default(0),
  /** Briefing length before a level auto-starts; e2e tests shorten it. */
  BRIEFING_MS: z.coerce.number().int().min(0).max(120_000).default(BRIEFING_DURATION_MS),
  // Optional, no default, so `Env` literals in tests stay valid. Product settings live in
  // config.json; env only says where files are, plus kill switches that win over the file.
  /** config.json location (default: `config/config.json` in the repository or image). */
  CONFIG_PATH: z.string().min(1).optional(),
  /**
   * Ads kill switch: `false` turns ads off whatever config.json says, also across reloads. It is
   * written into the file's values before validation, so `true` cannot bypass `ads.signOff`.
   */
  ADS_ENABLED: z.stringbool().optional(),
  /** Built client `index.html` the HTML shell is rendered from (S7-70). */
  SHELL_HTML_PATH: z.string().min(1).optional(),
  /** Privacy note markdown served at /prywatnosc (S7-75). */
  PRIVACY_MD_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}
