// Where the idle newsroom props go (S3-07), derived from any level's tile map: monitors and paper
// stacks only on decorative furniture (never on the conveyor, stations, tables or the desk), one
// or two ceiling fans hanging over decorative furniture, a wall clock on the back wall away from
// the stations (their signs float there), and two columns of dust motes along the side walls.
import { fixtureAt, type TileMap, tileAt } from '@redakcja/shared';

export type PropTile = { col: number; row: number; x: number; z: number };

export type AmbienceLayout = {
  monitors: PropTile[];
  stacks: PropTile[];
  /** Tiles a ceiling fan hangs over (the fan itself is placed so it reads over this tile). */
  fans: PropTile[];
  /** Back-wall column for the clock, or null when the back wall has no room. */
  clock: PropTile | null;
  /** Centres of the dust-mote columns (floor positions). */
  motes: { x: number; z: number }[];
};

export const AMBIENCE_LIMITS = { monitors: 4, stacks: 6, fans: 2 } as const;
/** Two fans closer than this (tiles) would crowd each other: keep one. */
const MIN_FAN_SPACING = 3;

const tile = (col: number, row: number): PropTile => ({ col, row, x: col + 0.5, z: row + 0.5 });

/** Decorative furniture: furniture tiles without a fixture, in reading order. */
export function decorativeTiles(map: TileMap): PropTile[] {
  const out: PropTile[] = [];
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (tileAt(map, col, row) === 'furniture' && !fixtureAt(map, col, row)) {
        out.push(tile(col, row));
      }
    }
  }
  return out;
}

function pickFans(tiles: readonly PropTile[]): PropTile[] {
  if (tiles.length === 0) {
    return [];
  }
  // The leftmost and the rightmost decorative tile (front-most on ties).
  const byCol = [...tiles].sort((a, b) => a.col - b.col || b.row - a.row);
  const left = byCol[0];
  const right = byCol[byCol.length - 1];
  if (!left || !right) {
    return [];
  }
  return right.col - left.col >= MIN_FAN_SPACING ? [left, right] : [left];
}

/** The back-wall column farthest from any back-row fixture, nearest the centre on ties. */
function pickClock(map: TileMap): PropTile | null {
  let best: { col: number; distance: number } | null = null;
  const fixtureCols = map.fixtures.filter((f) => f.row <= 1).map((f) => f.col);
  for (let col = 1; col < map.width - 1; col++) {
    if (tileAt(map, col, 0) !== 'wall' || tileAt(map, col, 1) === 'wall') {
      continue;
    }
    const distance = Math.min(map.width, ...fixtureCols.map((c) => Math.abs(c - col)));
    const centre = Math.abs(col + 0.5 - map.width / 2);
    if (
      !best ||
      distance > best.distance ||
      (distance === best.distance && centre < Math.abs(best.col + 0.5 - map.width / 2))
    ) {
      best = { col, distance };
    }
  }
  return best ? tile(best.col, 0) : null;
}

export function ambienceLayout(map: TileMap): AmbienceLayout {
  const decorative = decorativeTiles(map);
  const fans = pickFans(decorative).slice(0, AMBIENCE_LIMITS.fans);
  const fanKeys = new Set(fans.map((f) => `${f.col},${f.row}`));
  const monitors: PropTile[] = [];
  const stacks: PropTile[] = [];
  let i = 0;
  for (const t of decorative) {
    if (fanKeys.has(`${t.col},${t.row}`)) {
      continue;
    }
    // A calm rhythm: monitor, stack, empty, stack, …
    const slot = i++ % 4;
    if (slot === 0 && monitors.length < AMBIENCE_LIMITS.monitors) {
      monitors.push(t);
    } else if ((slot === 1 || slot === 3) && stacks.length < AMBIENCE_LIMITS.stacks) {
      stacks.push(t);
    }
  }
  const motes = [
    { x: 1.6, z: map.height * 0.55 },
    { x: map.width - 1.6, z: map.height * 0.45 },
  ];
  return { monitors, stacks, fans, clock: pickClock(map), motes };
}
