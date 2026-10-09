// Canvas art for the wall decor (S5-01): one atlas with the posters and the window views, plus a
// small seamless rain-streak tile. Everything is flat shapes in palette tokens with a thick navy
// edge, like the folder covers; words are short and in Polish (fictional Nowe Brzegi).
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { colors } from '../ui/tokens.ts';
import type { PosterId, WindowView } from './theme.ts';

export const CELL = 128;
const COLUMNS = 8;

export const ATLAS_ORDER = [
  'welcome',
  'storm',
  'voteRed',
  'voteBlue',
  'school',
  'book',
  'cross',
  'heart',
  'live',
  'glitch',
  'yes',
  'no',
  'alarm',
  'news',
  'view:day',
  'view:storm',
  'view:night',
  'view:dusk',
] as const satisfies readonly (PosterId | `view:${WindowView}`)[];

export type AtlasCell = (typeof ATLAS_ORDER)[number];

const ROWS = Math.ceil(ATLAS_ORDER.length / COLUMNS);
const FONT = '"Baloo 2 Variable", "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';

/** UV rectangle of an atlas cell, inset half a texel against bleeding. */
export function cellUv(cell: AtlasCell): { u0: number; v0: number; u1: number; v1: number } {
  const index = ATLAS_ORDER.indexOf(cell);
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const e = 0.5;
  return {
    u0: (col * CELL + e) / (COLUMNS * CELL),
    u1: ((col + 1) * CELL - e) / (COLUMNS * CELL),
    v1: 1 - (row * CELL + e) / (ROWS * CELL),
    v0: 1 - ((row + 1) * CELL - e) / (ROWS * CELL),
  };
}

type Ctx = CanvasRenderingContext2D;

function stroke(ctx: Ctx, width = 5): void {
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/** Filled shape with a navy outline. */
function shape(ctx: Ctx, fill: string, width = 5): void {
  ctx.fillStyle = fill;
  ctx.fill();
  stroke(ctx, width);
  ctx.stroke();
}

function text(ctx: Ctx, value: string, y: number, size: number, color: string): void {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = colors.outline;
  ctx.lineJoin = 'round';
  ctx.strokeText(value, CELL / 2, y);
  ctx.fillStyle = color;
  ctx.fillText(value, CELL / 2, y);
}

function star(ctx: Ctx, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  ctx.closePath();
  shape(ctx, fill, 4);
}

function cloud(ctx: Ctx, cx: number, cy: number, s: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(cx - 16 * s, cy, 14 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(cx, cy - 10 * s, 18 * s, Math.PI, Math.PI * 2);
  ctx.arc(cx + 18 * s, cy, 14 * s, Math.PI * 1.5, Math.PI * 0.5);
  ctx.closePath();
  shape(ctx, fill, 4);
}

function bolt(ctx: Ctx, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(cx + 4 * s, cy - 16 * s);
  ctx.lineTo(cx - 10 * s, cy + 4 * s);
  ctx.lineTo(cx, cy + 4 * s);
  ctx.lineTo(cx - 6 * s, cy + 18 * s);
  ctx.lineTo(cx + 12 * s, cy - 4 * s);
  ctx.lineTo(cx + 2 * s, cy - 4 * s);
  ctx.closePath();
  shape(ctx, colors.yellow, 4);
}

function background(ctx: Ctx, fill: string, edge = 6): void {
  ctx.fillStyle = colors.outline;
  ctx.fillRect(0, 0, CELL, CELL);
  ctx.fillStyle = fill;
  ctx.fillRect(edge, edge, CELL - edge * 2, CELL - edge * 2);
}

const DRAW: Record<AtlasCell, (ctx: Ctx) => void> = {
  welcome(ctx) {
    background(ctx, colors.yellow);
    text(ctx, 'WITAJ', 44, 34, colors.surface);
    text(ctx, 'W REDAKCJI', 84, 19, colors.surface);
  },
  storm(ctx) {
    background(ctx, colors.blueDark);
    cloud(ctx, 64, 50, 1.5, colors.surfaceSunk);
    bolt(ctx, 64, 88, 1.5);
  },
  voteRed(ctx) {
    background(ctx, colors.red);
    star(ctx, 64, 46, 28, colors.yellow);
    text(ctx, 'GŁOSUJ!', 98, 22, colors.surface);
  },
  voteBlue(ctx) {
    background(ctx, colors.blue);
    star(ctx, 64, 46, 28, colors.surface);
    text(ctx, 'RAZEM!', 98, 24, colors.yellow);
  },
  school(ctx) {
    background(ctx, colors.orange);
    // Graduation cap.
    ctx.beginPath();
    ctx.moveTo(64, 26);
    ctx.lineTo(104, 44);
    ctx.lineTo(64, 62);
    ctx.lineTo(24, 44);
    ctx.closePath();
    shape(ctx, colors.outline);
    ctx.beginPath();
    ctx.rect(42, 56, 44, 18);
    shape(ctx, colors.outline);
    text(ctx, 'SZKOŁA', 98, 22, colors.surface);
  },
  book(ctx) {
    background(ctx, colors.yellow);
    ctx.beginPath();
    ctx.moveTo(64, 38);
    ctx.lineTo(30, 30);
    ctx.lineTo(30, 80);
    ctx.lineTo(64, 88);
    ctx.lineTo(98, 80);
    ctx.lineTo(98, 30);
    ctx.closePath();
    shape(ctx, colors.surface);
    ctx.beginPath();
    ctx.moveTo(64, 38);
    ctx.lineTo(64, 88);
    stroke(ctx, 4);
    ctx.stroke();
    text(ctx, 'CZYTAJ', 108, 16, colors.blueDark);
  },
  cross(ctx) {
    background(ctx, colors.surface);
    ctx.beginPath();
    ctx.rect(50, 20, 28, 66);
    ctx.rect(31, 39, 66, 28);
    shape(ctx, colors.green);
    ctx.beginPath();
    ctx.rect(50, 39, 28, 28);
    ctx.fillStyle = colors.green;
    ctx.fill();
    text(ctx, 'ZDROWIE', 104, 17, colors.greenDark);
  },
  heart(ctx) {
    background(ctx, colors.green);
    ctx.beginPath();
    ctx.moveTo(64, 82);
    ctx.bezierCurveTo(16, 52, 34, 20, 64, 42);
    ctx.bezierCurveTo(94, 20, 112, 52, 64, 82);
    ctx.closePath();
    shape(ctx, colors.surface);
    ctx.beginPath();
    ctx.moveTo(22, 96);
    ctx.lineTo(48, 96);
    ctx.lineTo(56, 84);
    ctx.lineTo(68, 108);
    ctx.lineTo(76, 96);
    ctx.lineTo(106, 96);
    stroke(ctx, 5);
    ctx.stroke();
  },
  live(ctx) {
    background(ctx, colors.outline, 4);
    ctx.fillStyle = colors.textSoft;
    ctx.fillRect(10, 10, CELL - 20, CELL - 20);
    ctx.beginPath();
    ctx.arc(30, 26, 9, 0, Math.PI * 2);
    shape(ctx, colors.red, 4);
    text(ctx, 'NA', 56, 30, colors.surface);
    text(ctx, 'ŻYWO', 94, 30, colors.surface);
  },
  glitch(ctx) {
    background(ctx, colors.purple);
    ctx.beginPath();
    ctx.arc(64, 54, 30, 0, Math.PI * 2);
    shape(ctx, colors.surfaceSoft);
    ctx.fillStyle = colors.outline;
    ctx.fillRect(50, 46, 8, 10);
    ctx.fillRect(72, 46, 8, 10);
    ctx.fillRect(52, 68, 26, 5);
    // Glitch slices: shifted bands of the face.
    ctx.fillStyle = colors.red;
    ctx.fillRect(44, 56, 52, 6);
    ctx.fillStyle = colors.blue;
    ctx.fillRect(34, 64, 40, 5);
    text(ctx, '???', 104, 24, colors.yellow);
  },
  yes(ctx) {
    background(ctx, colors.green);
    text(ctx, 'TAK', 64, 44, colors.surface);
  },
  no(ctx) {
    background(ctx, colors.red);
    text(ctx, 'NIE', 64, 44, colors.surface);
  },
  alarm(ctx) {
    background(ctx, colors.yellow);
    ctx.beginPath();
    ctx.moveTo(64, 20);
    ctx.lineTo(108, 100);
    ctx.lineTo(20, 100);
    ctx.closePath();
    shape(ctx, colors.red);
    text(ctx, '!', 72, 52, colors.surface);
  },
  news(ctx) {
    background(ctx, colors.surface);
    ctx.fillStyle = colors.outline;
    ctx.fillRect(14, 14, 100, 24);
    text(ctx, 'NB', 27, 22, colors.surface);
    ctx.fillStyle = colors.sky;
    ctx.fillRect(16, 46, 44, 34);
    stroke(ctx, 3);
    ctx.strokeRect(16, 46, 44, 34);
    ctx.fillStyle = colors.textFaint;
    for (const y of [48, 60, 72]) {
      ctx.fillRect(68, y, 44, 6);
    }
    for (const y of [92, 104]) {
      ctx.fillRect(16, y, 96, 6);
    }
  },
  'view:day'(ctx) {
    ctx.fillStyle = colors.sky;
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.beginPath();
    ctx.arc(94, 34, 15, 0, Math.PI * 2);
    shape(ctx, colors.yellow, 4);
    cloud(ctx, 40, 52, 1, colors.surface);
    ctx.fillStyle = colors.green;
    ctx.fillRect(0, 96, CELL, 32);
  },
  'view:storm'(ctx) {
    ctx.fillStyle = colors.blueDark;
    ctx.fillRect(0, 0, CELL, CELL);
    cloud(ctx, 40, 38, 1.2, colors.textSoft);
    cloud(ctx, 92, 60, 1.1, colors.textFaint);
    bolt(ctx, 70, 92, 1.2);
    ctx.fillStyle = colors.outline;
    ctx.fillRect(0, 110, CELL, 18);
  },
  'view:night'(ctx) {
    ctx.fillStyle = colors.outline;
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.beginPath();
    ctx.arc(92, 32, 14, 0, Math.PI * 2);
    ctx.fillStyle = colors.surfaceSoft;
    ctx.fill();
    ctx.fillStyle = colors.surface;
    for (const [x, y] of [
      [20, 20],
      [44, 40],
      [66, 16],
      [12, 58],
    ] as const) {
      ctx.fillRect(x, y, 4, 4);
    }
    // City skyline with lit windows.
    const towers: [number, number, number][] = [
      [4, 66, 28],
      [34, 50, 30],
      [66, 72, 26],
      [94, 58, 30],
    ];
    for (const [x, y, w] of towers) {
      ctx.fillStyle = colors.textSoft;
      ctx.fillRect(x, y, w, CELL - y);
      ctx.fillStyle = colors.yellow;
      for (let wy = y + 8; wy < CELL - 8; wy += 16) {
        ctx.fillRect(x + 6, wy, 6, 6);
        ctx.fillRect(x + w - 14, wy, 6, 6);
      }
    }
  },
  'view:dusk'(ctx) {
    ctx.fillStyle = colors.orange;
    ctx.fillRect(0, 0, CELL, CELL);
    ctx.fillStyle = colors.red;
    ctx.fillRect(0, 60, CELL, 68);
    ctx.beginPath();
    ctx.arc(64, 70, 24, Math.PI, Math.PI * 2);
    ctx.fillStyle = colors.yellow;
    ctx.fill();
    ctx.fillStyle = colors.outline;
    for (const [x, y, w] of [
      [0, 86, 24],
      [24, 74, 20],
      [60, 90, 22],
      [84, 70, 22],
      [104, 84, 24],
    ] as const) {
      ctx.fillRect(x, y, w, CELL - y);
    }
  },
};

/** Draws the whole atlas; call again once the web font has loaded to get crisp lettering. */
export function drawDecorAtlas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ATLAS_ORDER.forEach((cell, index) => {
    ctx.save();
    ctx.translate((index % COLUMNS) * CELL, Math.floor(index / COLUMNS) * CELL);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    DRAW[cell](ctx);
    ctx.restore();
  });
}

export function createDecorAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * CELL;
  canvas.height = ROWS * CELL;
  drawDecorAtlas(canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  // Lettering uses the display font: redraw once it is ready.
  void document.fonts
    ?.load(`800 24px ${FONT}`)
    .then(() => {
      drawDecorAtlas(canvas);
      texture.needsUpdate = true;
    })
    .catch(() => {});
  return texture;
}

/** Seamless diagonal rain streaks on a transparent tile (cut out with an alpha test). */
export function createRainTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = colors.surface;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const streaks: [number, number, number][] = [
      [8, 10, 22],
      [30, 64, 26],
      [50, 30, 20],
      [18, 92, 24],
      [42, 108, 22],
    ];
    for (const [x, y, len] of streaks) {
      // Draw each streak twice, one tile apart, so the tile wraps seamlessly.
      for (const dy of [0, size * 2, -size * 2]) {
        ctx.beginPath();
        ctx.moveTo(x, y + dy);
        ctx.lineTo(x - len * 0.22, y + dy + len);
        ctx.stroke();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  return texture;
}
