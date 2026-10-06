// Tile map of the newsroom. World units are tiles; tile (col, row) covers
// x ∈ [col, col + 1), y ∈ [row, row + 1). Layouts are plain data so levels can define them.

import { INTERACTION_REACH_TILES } from '../constants.ts';
import type { StationKind } from '../domain.ts';

export type TileKind = 'floor' | 'wall' | 'furniture';

export type Vec2 = { x: number; y: number };

export type FixtureKind = 'conveyor' | 'station' | 'desk' | 'table';

/**
 * A solid, interactive tile. Each fixture holds at most one folder. Ids are `<kind>-<n>` (or
 * `<stationKind>-<n>` for stations), numbered in reading order, so they are stable per layout.
 */
export type Fixture = {
  id: string;
  kind: FixtureKind;
  /** Set for `kind: 'station'`. */
  station?: StationKind;
  col: number;
  row: number;
};

export type TileMap = {
  width: number;
  height: number;
  /** Row-major, length width * height. */
  tiles: TileKind[];
  /** Centre points of spawn tiles, in slot order. */
  spawns: Vec2[];
  /** Interactive tiles in reading order. */
  fixtures: Fixture[];
};

const FIXTURE_CHARS: Record<string, { kind: FixtureKind; station?: StationKind }> = {
  C: { kind: 'conveyor' },
  D: { kind: 'desk' },
  T: { kind: 'table' },
  I: { kind: 'station', station: 'imageSearch' },
  A: { kind: 'station', station: 'archive' },
  R: { kind: 'station', station: 'sourceRegistry' },
  P: { kind: 'station', station: 'phone' },
  S: { kind: 'station', station: 'aiScanner' },
  L: { kind: 'station', station: 'dataLibrary' },
};

/**
 * Layout legend:
 *   `#` wall, `=` furniture (solid, decoration), `.` floor,
 *   `1`–`4` floor with the spawn point for that player slot,
 *   fixtures (solid): `C` conveyor, `D` editorial desk, `T` table (put-down surface),
 *   stations `I` image search, `A` archive, `R` source registry, `P` phone, `S` AI scanner,
 *   `L` data library.
 */
export function parseLayout(rows: readonly string[]): TileMap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('Layout must not be empty');
  }
  const tiles: TileKind[] = [];
  const spawnsBySlot = new Map<number, Vec2>();
  const fixtures: Fixture[] = [];
  const fixtureCounts = new Map<string, number>();
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Layout row ${y} has length ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      switch (ch) {
        case '#':
          tiles.push('wall');
          break;
        case '=':
          tiles.push('furniture');
          break;
        case '.':
          tiles.push('floor');
          break;
        case '1':
        case '2':
        case '3':
        case '4':
          tiles.push('floor');
          spawnsBySlot.set(Number(ch) - 1, { x: x + 0.5, y: y + 0.5 });
          break;
        default: {
          const fixture = ch === undefined ? undefined : FIXTURE_CHARS[ch];
          if (!fixture) {
            throw new Error(`Unknown layout character "${ch}" at ${x},${y}`);
          }
          tiles.push('furniture');
          const prefix = fixture.station ?? fixture.kind;
          const n = fixtureCounts.get(prefix) ?? 0;
          fixtureCounts.set(prefix, n + 1);
          fixtures.push({
            id: `${prefix}-${n}`,
            kind: fixture.kind,
            ...(fixture.station ? { station: fixture.station } : {}),
            col: x,
            row: y,
          });
        }
      }
    }
  });
  const spawns: Vec2[] = [];
  for (let slot = 0; slot < spawnsBySlot.size; slot++) {
    const spawn = spawnsBySlot.get(slot);
    if (!spawn) {
      throw new Error(`Spawn slots must be consecutive from 1; missing ${slot + 1}`);
    }
    spawns.push(spawn);
  }
  return { width, height, tiles, spawns, fixtures };
}

export function tileAt(map: TileMap, col: number, row: number): TileKind {
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) {
    return 'wall';
  }
  return map.tiles[row * map.width + col] ?? 'wall';
}

export function isSolid(map: TileMap, col: number, row: number): boolean {
  return tileAt(map, col, row) !== 'floor';
}

export function fixtureById(map: TileMap, id: string): Fixture | undefined {
  return map.fixtures.find((f) => f.id === id);
}

export function fixtureAt(map: TileMap, col: number, row: number): Fixture | undefined {
  return map.fixtures.find((f) => f.col === col && f.row === row);
}

/** Centre of a tile in world units. */
export function tileCenter(col: number, row: number): Vec2 {
  return { x: col + 0.5, y: row + 0.5 };
}

/** The tile directly in front of a body facing `facing` (radians, 0 = +x, towards +y). */
export function frontTile(body: Vec2, facing: number): { col: number; row: number } {
  return {
    col: Math.floor(body.x + Math.cos(facing) * 0.75),
    row: Math.floor(body.y + Math.sin(facing) * 0.75),
  };
}

/**
 * The fixture a player at `body` facing `facing` interacts with: the fixture on the tile in
 * front if there is one, otherwise the nearest fixture whose tile centre is within reach.
 * Pure and deterministic (ties go to reading order).
 */
export function findInteractionTarget(
  map: TileMap,
  body: Vec2,
  facing: number,
): Fixture | undefined {
  const front = frontTile(body, facing);
  const inFront = fixtureAt(map, front.col, front.row);
  if (inFront) {
    return inFront;
  }
  let best: Fixture | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const fixture of map.fixtures) {
    const center = tileCenter(fixture.col, fixture.row);
    const distance = Math.hypot(center.x - body.x, center.y - body.y);
    if (distance <= INTERACTION_REACH_TILES && distance < bestDistance) {
      best = fixture;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Greybox newsroom: conveyor top-left, three stations along the back wall, tables and the
 * editorial desk in the middle. Level files carry their own copy of their layout.
 */
export const GREYBOX_LAYOUT: readonly string[] = [
  '####################',
  '#CCCC...I...A...R..#',
  '#..................#',
  '#..................#',
  '#..1....=TT=....2..#',
  '#.......====.......#',
  '#..................#',
  '#..3....=DD=....4..#',
  '#.......====.......#',
  '#.T..............T.#',
  '#..................#',
  '####################',
];

export const GREYBOX_MAP: TileMap = parseLayout(GREYBOX_LAYOUT);
