import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/redakcja.sqlite'),
  /** Dev only: artificial one-way latency added to every message in both directions. */
  DEV_LATENCY_MS: z.coerce.number().int().min(0).max(2000).default(0),
});

export type Env = z.infer<typeof envSchema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}
