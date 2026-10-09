// Procedural particle sprites: one small atlas drawn at load with Canvas2D, shared by every
// particle (one texture, one draw call). Each cell is a flat shape: red channel 1 = fill (tinted
// per particle), red channel 0 = navy outline (the shader paints the outline token), alpha 0 =
// empty. No image files, nothing to download.

export const SPRITE_CELL = 64;
export const SPRITE_COLUMNS = 4;
export const SPRITE_ROWS = 4;

/** Frame names in atlas order (row-major from the top-left). */
export const spriteFrames = [
  'square',
  'strip',
  'dot',
  'triangle',
  'star',
  'scrap',
  'splat',
  'spark',
  'puff',
  'glitch',
  'heart',
  'share',
  'burst',
  'flake',
  'drop',
  'plus',
] as const;

export type SpriteFrame = (typeof spriteFrames)[number];

export function frameIndex(frame: SpriteFrame): number {
  return spriteFrames.indexOf(frame);
}

type Path = (ctx: CanvasRenderingContext2D) => void;

const C = SPRITE_CELL / 2;
/** Usable radius inside a cell, leaving room for the outline. */
const R = C - 7;

function polygon(points: readonly (readonly [number, number])[]): Path {
  return (ctx) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      if (i === 0) {
        ctx.moveTo(C + x * R, C + y * R);
      } else {
        ctx.lineTo(C + x * R, C + y * R);
      }
    });
    ctx.closePath();
  };
}

function starPath(points: number, inner: number, rotation = -Math.PI / 2): Path {
  const vertices: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? 1 : inner;
    const angle = rotation + (i * Math.PI) / points;
    vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return polygon(vertices);
}

function circles(list: readonly (readonly [number, number, number])[]): Path {
  return (ctx) => {
    ctx.beginPath();
    for (const [x, y, radius] of list) {
      ctx.moveTo(C + x * R + radius * R, C + y * R);
      ctx.arc(C + x * R, C + y * R, radius * R, 0, Math.PI * 2);
    }
  };
}

const paths: Record<SpriteFrame, Path> = {
  square: polygon([
    [-0.8, -0.8],
    [0.8, -0.8],
    [0.8, 0.8],
    [-0.8, 0.8],
  ]),
  strip: polygon([
    [-1, -0.45],
    [1, -0.45],
    [1, 0.45],
    [-1, 0.45],
  ]),
  dot: circles([[0, 0, 0.85]]),
  triangle: polygon([
    [0, -0.95],
    [0.95, 0.75],
    [-0.95, 0.75],
  ]),
  star: starPath(5, 0.5),
  // A torn sheet: jagged top edge, one cut corner.
  scrap: polygon([
    [-0.85, -0.7],
    [-0.4, -0.9],
    [0.05, -0.65],
    [0.5, -0.9],
    [0.9, -0.6],
    [0.8, 0.85],
    [-0.45, 0.9],
    [-0.9, 0.45],
  ]),
  // An ink blot: an irregular spiky disc.
  splat: polygon(
    Array.from({ length: 18 }, (_, i): [number, number] => {
      const angle = (i * Math.PI) / 9;
      const radius = (i % 2 === 0 ? 0.95 : 0.55) * (1 - ((i * 7) % 5) * 0.06);
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }),
  ),
  spark: polygon([
    [0, -1],
    [0.22, -0.22],
    [1, 0],
    [0.22, 0.22],
    [0, 1],
    [-0.22, 0.22],
    [-1, 0],
    [-0.22, -0.22],
  ]),
  // A smoke puff: four overlapping circles, outlined as one cloud.
  puff: circles([
    [-0.45, 0.2, 0.5],
    [0.45, 0.25, 0.45],
    [0, -0.3, 0.55],
    [0, 0.3, 0.55],
  ]),
  // A glitch bit: a block with a notch bitten out.
  glitch: polygon([
    [-0.9, -0.8],
    [0.9, -0.8],
    [0.9, -0.1],
    [0.3, -0.1],
    [0.3, 0.3],
    [0.9, 0.3],
    [0.9, 0.8],
    [-0.9, 0.8],
  ]),
  heart: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(C, C + R * 0.9);
    ctx.bezierCurveTo(C - R * 1.5, C + R * 0.05, C - R * 0.8, C - R * 1.1, C, C - R * 0.35);
    ctx.bezierCurveTo(C + R * 0.8, C - R * 1.1, C + R * 1.5, C + R * 0.05, C, C + R * 0.9);
    ctx.closePath();
  },
  // The share arrow: a chunky arrow pointing right.
  share: polygon([
    [-0.95, 0.2],
    [-0.95, 0.95],
    [-0.2, 0.95],
    [-0.2, 0.35],
    [0.1, 0.35],
    [0.1, 0.75],
    [0.95, 0],
    [0.1, -0.75],
    [0.1, -0.35],
    [-0.6, -0.35],
  ]),
  burst: starPath(8, 0.55, -Math.PI / 8),
  flake: polygon([
    [-0.8, -0.2],
    [-0.2, -0.85],
    [0.7, -0.5],
    [0.85, 0.3],
    [0.1, 0.85],
    [-0.65, 0.55],
  ]),
  drop: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(C, C - R * 0.95);
    ctx.bezierCurveTo(
      C + R * 0.2,
      C - R * 0.35,
      C + R * 0.75,
      C + R * 0.1,
      C + R * 0.6,
      C + R * 0.55,
    );
    ctx.bezierCurveTo(
      C + R * 0.45,
      C + R * 1.0,
      C - R * 0.45,
      C + R * 1.0,
      C - R * 0.6,
      C + R * 0.55,
    );
    ctx.bezierCurveTo(C - R * 0.75, C + R * 0.1, C - R * 0.2, C - R * 0.35, C, C - R * 0.95);
    ctx.closePath();
  },
  plus: polygon([
    [-0.3, -0.95],
    [0.3, -0.95],
    [0.3, -0.3],
    [0.95, -0.3],
    [0.95, 0.3],
    [0.3, 0.3],
    [0.3, 0.95],
    [-0.3, 0.95],
    [-0.3, 0.3],
    [-0.95, 0.3],
    [-0.95, -0.3],
    [-0.3, -0.3],
  ]),
};

/** Draws every frame into `ctx` (a canvas of SPRITE_COLUMNS x SPRITE_ROWS cells). */
export function drawSpriteAtlas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, SPRITE_CELL * SPRITE_COLUMNS, SPRITE_CELL * SPRITE_ROWS);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  spriteFrames.forEach((frame, index) => {
    ctx.save();
    ctx.translate(
      (index % SPRITE_COLUMNS) * SPRITE_CELL,
      Math.floor(index / SPRITE_COLUMNS) * SPRITE_CELL,
    );
    paths[frame](ctx);
    // Black stroke = outline channel; white fill on top so the outline sits just outside.
    ctx.strokeStyle = 'black';
    ctx.stroke();
    ctx.fillStyle = 'white';
    ctx.fill('nonzero');
    ctx.restore();
  });
}
