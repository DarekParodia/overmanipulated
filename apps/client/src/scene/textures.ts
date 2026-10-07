// Canvas-drawn textures for world entities: the folder cover atlas (type icon × priority flags,
// drawn with the game's own icon paths), the conveyor belt slats and the hazard rails. Drawn
// once per canvas.
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { ICON_STROKE, iconParts } from '../ui/icons/Icon.tsx';
import { colors } from '../ui/tokens.ts';
import { ATLAS_PRIORITIES, ATLAS_TYPES, type FolderLook } from './entities.ts';

/** One atlas cell, matching the folder's width:depth ratio (4 : 3). */
export const COVER_PX = { width: 128, height: 96 } as const;

/** Thick navy edge of the cover; the folder's sides sample it too. */
const EDGE = 7;
const PRIORITY_COLOR = {
  normal: colors.blue,
  important: colors.orange,
  urgent: colors.red,
} as const;
/** Flag count per priority, so priority never relies on colour alone. */
const PRIORITY_FLAGS = { normal: 1, important: 2, urgent: 3 } as const;

/** One priority flag: navy pole, pennant in the priority colour with a navy outline. */
function drawFlag(ctx: CanvasRenderingContext2D, x: number, color: string): void {
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, 15);
  ctx.lineTo(x, 50);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, 15);
  ctx.lineTo(x + 13, 22);
  ctx.lineTo(x, 30);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
}

function drawCover(ctx: CanvasRenderingContext2D, look: FolderLook): void {
  const { width: w, height: h } = COVER_PX;
  // Navy everywhere, bright yellow card inset: a thick dark edge all round.
  ctx.fillStyle = colors.outline;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = colors.folder;
  ctx.beginPath();
  ctx.roundRect(EDGE, EDGE, w - EDGE * 2, h - EDGE * 2, 9);
  ctx.fill();

  // Type icon, big, on a white badge.
  const cx = 45;
  const cy = h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 31, 0, Math.PI * 2);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors.outline;
  ctx.stroke();
  const iconSize = 42;
  const scale = iconSize / 24;
  ctx.save();
  ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = colors.outline;
  ctx.fillStyle = colors.outline;
  ctx.lineWidth = ICON_STROKE * 1.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const part of iconParts(look.type)) {
    const path = new Path2D(part.d);
    if (part.fill === 'solid') {
      ctx.fill(path);
    }
    ctx.stroke(path);
  }
  ctx.restore();

  // Priority: 1, 2 or 3 flags (shape count), in blue / orange / red.
  const flags = PRIORITY_FLAGS[look.priority];
  for (let i = 0; i < flags; i++) {
    drawFlag(ctx, 82 + i * 12, PRIORITY_COLOR[look.priority]);
  }
}

/** Folder cover atlas: column = story type, row = priority (see `atlasCell`). */
export function createFolderAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = COVER_PX.width * ATLAS_TYPES.length;
  canvas.height = COVER_PX.height * ATLAS_PRIORITIES.length;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ATLAS_PRIORITIES.forEach((priority, row) => {
      ATLAS_TYPES.forEach((type, col) => {
        ctx.save();
        ctx.translate(col * COVER_PX.width, row * COVER_PX.height);
        ctx.beginPath();
        ctx.rect(0, 0, COVER_PX.width, COVER_PX.height);
        ctx.clip();
        drawCover(ctx, { type, priority });
        ctx.restore();
      });
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

/** Rubber belt with cross slats; scrolled along x to make the conveyor run. */
export function createBeltTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = colors.textSoft;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = colors.outline;
    for (let x = 0; x < 64; x += 16) {
      ctx.fillRect(x, 0, 4, 64);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Yellow and navy diagonal hazard stripes for the conveyor rails. */
export function createHazardTexture(): CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = colors.yellow;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = colors.outline;
    for (const offset of [-size, 0, size]) {
      ctx.beginPath();
      ctx.moveTo(offset, size);
      ctx.lineTo(offset + size / 2, size);
      ctx.lineTo(offset + size, 0);
      ctx.lineTo(offset + size / 2, 0);
      ctx.closePath();
      ctx.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(5, 1);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}
