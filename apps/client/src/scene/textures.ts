// Canvas-drawn textures for world entities: the folder cover atlas (type icon × priority band,
// drawn with the game's own icon paths) and the conveyor belt slats. Drawn once per canvas.
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { iconPath } from '../ui/icons/Icon.tsx';
import { palette } from '../ui/tokens.ts';
import { ATLAS_PRIORITIES, ATLAS_TYPES, type FolderLook } from './entities.ts';

/** One atlas cell, matching the folder's width:depth ratio (0.5 : 0.38). */
export const COVER_PX = { width: 128, height: 96 } as const;

function drawCover(ctx: CanvasRenderingContext2D, look: FolderLook): void {
  const { width: w, height: h } = COVER_PX;
  ctx.fillStyle = palette.manila;
  ctx.fillRect(0, 0, w, h);
  // Worn edge of the card stock and the back sheet's tab peeking out at the top left.
  ctx.strokeStyle = palette.manilaDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ctx.fillStyle = palette.manilaDark;
  ctx.fillRect(8, 0, 38, 7);

  // Priority band along the bottom: normal = one thin rule, important = solid ochre band,
  // urgent = taller red band with paper hatching. The pattern differs, not only the colour.
  if (look.priority === 'normal') {
    ctx.fillStyle = palette.ink;
    ctx.fillRect(8, h - 14, w - 16, 2);
  } else if (look.priority === 'important') {
    ctx.fillStyle = palette.ochre;
    ctx.fillRect(3, h - 20, w - 6, 15);
    ctx.fillStyle = palette.ink;
    ctx.fillRect(3, h - 21, w - 6, 2);
  } else {
    const top = h - 28;
    ctx.fillStyle = palette.editorialRed;
    ctx.fillRect(3, top, w - 6, 25);
    ctx.save();
    ctx.beginPath();
    ctx.rect(3, top, w - 6, 25);
    ctx.clip();
    ctx.strokeStyle = palette.paper;
    ctx.lineWidth = 4;
    for (let x = -30; x < w + 30; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, top + 25);
      ctx.lineTo(x + 25, top);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = palette.ink;
    ctx.fillRect(3, top - 2, w - 6, 2);
    ctx.fillRect(3, top - 6, w - 6, 2);
  }

  // Type icon: the same hand-drawn path as the 2D icon set, inked large on the cover.
  const iconSize = look.priority === 'urgent' ? 48 : 60;
  const scale = iconSize / 24;
  ctx.save();
  ctx.translate(10, 10);
  ctx.scale(scale, scale);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(iconPath(look.type)));
  ctx.restore();
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
    ctx.fillStyle = palette.inkSoft;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = palette.inkFaint;
    for (let x = 0; x < 64; x += 16) {
      ctx.fillRect(x, 0, 3, 64);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}
