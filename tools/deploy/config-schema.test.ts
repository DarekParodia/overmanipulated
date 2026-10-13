import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SERVER_CONFIG, parseConfigText } from '../../apps/server/src/config.ts';
import { CONFIG_SCHEMA_PATH, configJsonSchema } from './config-schema.ts';

const EXAMPLE_PATH = fileURLToPath(new URL('../../config/config.example.json', import.meta.url));

describe('config/config.schema.json', () => {
  it('matches the server schema (regenerate with bun run config:schema)', () => {
    const committed: unknown = JSON.parse(readFileSync(CONFIG_SCHEMA_PATH, 'utf8'));
    expect(committed).toEqual(configJsonSchema());
  });
});

describe('config/config.example.json', () => {
  it('parses, with ads off and the default limits', () => {
    const result = parseConfigText(readFileSync(EXAMPLE_PATH, 'utf8'));
    if (!result.ok) throw new Error(result.error);
    expect(result.config.ads.enabled).toBe(false);
    expect(result.config.features).toEqual(DEFAULT_SERVER_CONFIG.features);
    expect(result.config.rooms).toEqual({ maxRooms: 300, defaultDifficulty: 'normal' });
  });
});
