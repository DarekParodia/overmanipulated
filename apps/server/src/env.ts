import { BRIEFING_DURATION_MS } from '@redakcja/shared';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/redakcja.sqlite'),
  /** Dev only: artificial one-way latency added to every message in both directions. */
  DEV_LATENCY_MS: z.coerce.number().int().min(0).max(2000).default(0),
  /** Briefing length before a level auto-starts; e2e tests shorten it. */
  BRIEFING_MS: z.coerce.number().int().min(0).max(120_000).default(BRIEFING_DURATION_MS),
});

export type Env = z.infer<typeof envSchema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}
