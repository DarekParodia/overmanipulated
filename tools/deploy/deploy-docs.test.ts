// Keeps docs/deploy.md and .env.example in step with the code (S7-76): every config.json key has
// exactly one row in the "config.json" table with its real default and a hot-reload entry, and
// every environment variable the server or compose reads has a row in "Environment variables"
// and a line in .env.example. The abuse-limits table states the shipped constants (S7-93).
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serverConfigJsonSchema } from '../../apps/server/src/config.ts';
import { envSchema } from '../../apps/server/src/env.ts';
import {
  JOINS_PER_MINUTE_PER_IP,
  KICK_REJOIN_COOLDOWN_MS,
  MAX_ROOMS,
  ROOM_LIST_CACHE_MS,
  ROOM_LIST_PER_MINUTE_PER_IP,
  ROOMS_PER_MINUTE_PER_IP,
  WS_MESSAGE_BURST,
  WS_MESSAGES_PER_SECOND,
} from '../../apps/server/src/limits.ts';
import {
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_ROOM_PLAYERS,
  MAX_SPECTATORS,
  MAX_TEAM_PLAYERS,
  ROOM_LIST_MAX,
  ROOM_NAME_MAX_LENGTH,
} from '../../packages/shared/src/constants.ts';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const DEPLOY_MD = read('../../docs/deploy.md');
const ENV_EXAMPLE = read('../../.env.example');

/** Variables read outside the server's env schema: the logger and Caddy (via compose). */
const OTHER_ENV = ['LOG_LEVEL', 'TRUSTED_PROXIES'];

type Row = { key: string; cells: string[] };

/**
 * Rows of the first table under the heading `heading` (exact line), keyed by the first cell: its
 * `code` text, or (with `plainKeys`) the whole cell. Rows without a key are skipped.
 */
function tableRows(heading: string, plainKeys = false): Row[] {
  const lines = DEPLOY_MD.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`heading "${heading}" not found in docs/deploy.md`);
  const rows: Row[] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break;
    if (!line.startsWith('|')) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    // Split on pipes that are not escaped (`\|` inside a cell).
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim());
    const key = plainKeys ? cells[0] : /^`([^`]+)`$/.exec(cells[0] ?? '')?.[1];
    if (key !== undefined && key !== '' && !/^-+$/.test(key)) {
      rows.push({ key, cells: cells.slice(1) });
    }
  }
  return rows;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Leaf = { path: string; required: boolean; default?: unknown; hasDefault: boolean };

/**
 * Every key an operator can write: objects with named properties are walked into; a nullable
 * object (`motd`) is a key of its own and is walked into too; everything else is a leaf.
 */
function configKeys(node: unknown, path: string, required: boolean, out: Leaf[]): Leaf[] {
  if (!isRecord(node)) return out;
  const hasDefault = 'default' in node;
  const leaf: Leaf = { path, required, default: node.default, hasDefault };
  const properties = node.properties;
  if (isRecord(properties)) {
    const requiredKeys = Array.isArray(node.required) ? node.required : [];
    for (const [key, child] of Object.entries(properties)) {
      if (key === '$schema') continue;
      configKeys(child, path === '' ? key : `${path}.${key}`, requiredKeys.includes(key), out);
    }
    return out;
  }
  if (Array.isArray(node.anyOf)) {
    out.push(leaf);
    for (const branch of node.anyOf) {
      if (isRecord(branch) && isRecord(branch.properties)) configKeys(branch, path, false, out);
    }
    return out;
  }
  out.push(leaf);
  return out;
}

const CONFIG_KEYS = configKeys(serverConfigJsonSchema(), '', false, []);
const CONFIG_ROWS = tableRows('### config.json');
const ENV_ROWS = tableRows('### Environment variables');
const LIMIT_ROWS = tableRows('## Abuse limits in the game server', true);

/** What the Default column must say for a key. */
function documentedDefault(leaf: Leaf): string {
  if (leaf.hasDefault) return `\`${JSON.stringify(leaf.default)}\``;
  return leaf.required ? 'required' : 'unset';
}

describe('docs/deploy.md config.json table', () => {
  it('has one row per config key, in schema order', () => {
    expect(CONFIG_ROWS.map((row) => row.key)).toEqual(CONFIG_KEYS.map((leaf) => leaf.path));
  });

  it('walks the schema down to the leaves', () => {
    expect(CONFIG_KEYS.map((leaf) => leaf.path)).toContain('ads.signOff.date');
    expect(CONFIG_KEYS.map((leaf) => leaf.path)).toContain('motd');
    expect(CONFIG_KEYS.length).toBe(28);
  });

  it('states the real default of every key', () => {
    for (const leaf of CONFIG_KEYS) {
      const row = CONFIG_ROWS.find((candidate) => candidate.key === leaf.path);
      expect({ key: leaf.path, default: row?.cells[0] }).toEqual({
        key: leaf.path,
        default: documentedDefault(leaf),
      });
    }
  });

  it('documents the defaults operators rely on', () => {
    const defaultOf = (key: string) => CONFIG_ROWS.find((row) => row.key === key)?.cells[0];
    expect(defaultOf('ads.enabled')).toBe('`false`');
    expect(defaultOf('ads.mode')).toBe('`"limited"`');
    expect(defaultOf('ads.ageTreatment')).toBe('`"teen"`');
    expect(defaultOf('features.roomBrowser')).toBe('`false`');
    expect(defaultOf('rooms.maxRooms')).toBe('`300`');
    expect(defaultOf('motd')).toBe('`null`');
    expect(defaultOf('ads.signOff.by')).toBe('required');
    expect(defaultOf('site.publicOrigin')).toBe('unset');
  });

  it('marks every key as hot-reloaded and explains it', () => {
    for (const row of CONFIG_ROWS) {
      expect({ key: row.key, hot: row.cells[1]?.startsWith('yes') }).toEqual({
        key: row.key,
        hot: true,
      });
      expect((row.cells[2] ?? '').length).toBeGreaterThan(10);
    }
  });
});

describe('docs/deploy.md environment table and .env.example', () => {
  const variables = [...Object.keys(envSchema.shape), ...OTHER_ENV].sort();

  it('has one row per environment variable', () => {
    expect(ENV_ROWS.map((row) => row.key).sort()).toEqual(variables);
  });

  it('says when each variable applies', () => {
    for (const row of ENV_ROWS) {
      expect({ key: row.key, applies: row.cells[2]?.startsWith('restart') }).toEqual({
        key: row.key,
        applies: true,
      });
    }
  });

  it('lists every variable in .env.example', () => {
    for (const name of variables) {
      expect({ name, listed: new RegExp(`^#? ?${name}=`, 'm').test(ENV_EXAMPLE) }).toEqual({
        name,
        listed: true,
      });
    }
  });

  it('keeps the trusted-proxies default in both places', () => {
    expect(ENV_EXAMPLE).toContain('TRUSTED_PROXIES=private_ranges');
    expect(ENV_ROWS.find((row) => row.key === 'TRUSTED_PROXIES')?.cells[1]).toBe(
      '`private_ranges`',
    );
  });
});

describe('docs/deploy.md abuse limits', () => {
  /** The Value cell of the row named `limit`. */
  const limitValue = (limit: string) => LIMIT_ROWS.find((row) => row.key === limit)?.cells[0];

  it('states the shipped numbers', () => {
    expect(limitValue('WebSocket message size')).toStartWith(`${MAX_CLIENT_MESSAGE_BYTES} bytes`);
    expect(limitValue('Message rate per socket')).toStartWith(
      `${WS_MESSAGES_PER_SECOND}/s sustained, burst ${WS_MESSAGE_BURST}`,
    );
    expect(limitValue('Joins (create or join) per IP')).toBe(
      `${JOINS_PER_MINUTE_PER_IP} per minute`,
    );
    expect(limitValue('New rooms per IP')).toBe(`${ROOMS_PER_MINUTE_PER_IP} per minute`);
    expect(limitValue('Room-list requests (`GET /api/rooms`) per IP')).toBe(
      `${ROOM_LIST_PER_MINUTE_PER_IP} per minute; the list itself is rebuilt at most every ${ROOM_LIST_CACHE_MS / 1000} s`,
    );
    expect(limitValue('Rooms alive at once')).toStartWith(`${MAX_ROOMS} `);
  });

  it('states the room, versus and spectator caps (S7-93)', () => {
    expect(limitValue('Players per room')).toBe(
      `${MAX_TEAM_PLAYERS} in „Razem”; ${MAX_ROOM_PLAYERS} in „Na punkty” (${MAX_TEAM_PLAYERS} per newsroom)`,
    );
    expect(limitValue('Spectators per room')).toStartWith(`${MAX_SPECTATORS}, `);
    expect(limitValue('Rejoin after a kick')).toStartWith(
      `${KICK_REJOIN_COOLDOWN_MS / 60_000} minutes, per browser \`clientId\``,
    );
    expect(limitValue('Room name')).toStartWith(`1–${ROOM_NAME_MAX_LENGTH} characters`);
    expect(limitValue('Public rooms per room-list response')).toBe(`${ROOM_LIST_MAX}`);
  });
});
