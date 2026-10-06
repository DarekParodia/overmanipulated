// Tile map of the newsroom. World units are tiles; tile (col, row) covers
// x ∈ [col, col + 1), y ∈ [row, row + 1). Layouts are plain data so levels can define them.

export type TileKind = 'floor' | 'wall' | 'furniture';

export type Vec2 = { x: number; y: number };

export type TileMap = {
  width: number;
  height: number;
  /** Row-major, length width * height. */
  tiles: TileKind[];
  /** Centre points of spawn tiles, in slot order. */
  spawns: Vec2[];
};

/**
 * Layout legend:
 *   `#` wall, `=` furniture (solid, rendered as a desk/table), `.` floor,
 *   `1`–`4` floor with the spawn point for that player slot.
 */
export function parseLayout(rows: readonly string[]): TileMap {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('Layout must not be empty');
  }
  const tiles: TileKind[] = [];
  const spawnsBySlot = new Map<number, Vec2>();
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
        default:
          throw new Error(`Unknown layout character "${ch}" at ${x},${y}`);
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
  return { width, height, tiles, spawns };
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

/**
 * Greybox newsroom used until levels define their own layouts (stage 2).
 * Furniture blocks stand in for the conveyor, stations and the editorial desk.
 */
export const GREYBOX_LAYOUT: readonly string[] = [
  '####################',
  '#..................#',
  '#.====.......====..#',
  '#..................#',
  '#..1....====....2..#',
  '#.......====.......#',
  '#..................#',
  '#..3....====....4..#',
  '#.......====.......#',
  '#.====.......====..#',
  '#..................#',
  '####################',
];

export const GREYBOX_MAP: TileMap = parseLayout(GREYBOX_LAYOUT);
