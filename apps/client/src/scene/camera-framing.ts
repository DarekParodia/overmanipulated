// Camera framing (S7-12), pure so it can be tested without a renderer. The angled top-down camera
// fits the whole newsroom when tiles would be big enough; on small screens it follows the local
// player at a readable zoom, clamped to the room. In follow mode it also keeps clear of the HUD
// band (hud/hud-band.ts): the room is framed in the uncovered part of the screen under it, and a
// view offset moves the projection centre to the middle of that part.
import type { PerspectiveCamera, Vector3 } from 'three';
import { HUD_BAND_MAX_SHARE } from '../hud/hud-band.ts';

/** Smallest acceptable on-screen tile size in CSS px before switching to follow mode. */
export const MIN_TILE_PX = 40;
/** Vertical field of view in degrees. */
export const FOV = 32;
export const CAMERA_NEAR = 0.5;
export const CAMERA_FAR = 200;
/** Camera elevation angle above the floor. */
export const ELEVATION = (58 * Math.PI) / 180;
/** In follow mode the view may extend this far past the room so HUD plates don't hide players. */
export const FOLLOW_EDGE_MARGIN = 1.5;
/** At the back the view may extend further: the signs over the back row sit there. */
export const FOLLOW_BACK_MARGIN = 3.5;
/** Fit mode: floor shown beside the room, in tiles (both sides together). */
const FIT_SIDE_ROOM = 1.5;
/** Fit mode: extra depth for the signs over the back row and the HUD above them, in tiles. */
export const FIT_BACK_ROOM = 5;
/**
 * Fit mode for a spectator view (S7-90): no HUD over the room, only the team plate, so the back
 * keeps room for the signs over the back row and little more.
 */
export const SPECTATOR_FIT_BACK_ROOM = 3;
/** Fit mode: the view centre sits this far in front of the room centre, towards the back. */
const FIT_BACK_SHIFT = 0.9;

export type FramingInput = {
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  /** Room size in tiles. */
  mapW: number;
  mapH: number;
  /** The local player's position (tiles; y is the world z), or null before it is known. */
  local: { x: number; y: number } | null;
  /** How far down the HUD band reaches, in CSS px (0 when not measured). */
  topInsetPx: number;
  /** Fit mode: depth kept free behind the room, in tiles (FIT_BACK_ROOM when left out). */
  backRoom?: number;
  /**
   * Follow `local` even when the whole room would fit (a spectator following a player, S7-91);
   * with `local` null the room is fitted as usual.
   */
  forceFollow?: boolean;
};

export type Framing = {
  /** True when following the local player, false when the whole room fits. */
  follow: boolean;
  /** The floor point the camera looks at (world x and z). */
  target: { x: number; z: number };
  /** Floor depth (tiles) the full screen height spans. */
  visibleDepth: number;
  /** Vertical view offset in CSS px; negative moves the picture down. 0 clears the offset. */
  viewOffsetY: number;
};

function clamp(value: number, low: number, high: number): number {
  // `high` wins when the bounds cross (a room smaller than the view), as the rig always did.
  return Math.min(high, Math.max(low, value));
}

export function computeFraming(input: FramingInput): Framing {
  const { width, height, mapW, mapH, local } = input;
  const sinE = Math.sin(ELEVATION);
  const fitWidth = mapW + FIT_SIDE_ROOM;
  const fitDepth = mapH + (input.backRoom ?? FIT_BACK_ROOM);
  const tilePxIfFit = Math.min(width / fitWidth, height / (fitDepth * sinE));
  if ((tilePxIfFit >= MIN_TILE_PX && input.forceFollow !== true) || local === null) {
    const aspect = width / Math.max(1, height);
    return {
      follow: false,
      target: { x: mapW / 2, z: mapH / 2 - FIT_BACK_SHIFT },
      visibleDepth: Math.max(fitDepth, fitWidth / aspect / sinE),
      viewOffsetY: 0,
    };
  }
  const inset = clamp(input.topInsetPx, 0, height * HUD_BAND_MAX_SHARE);
  const fullDepth = height / MIN_TILE_PX / sinE;
  const usableDepth = (height - inset) / MIN_TILE_PX / sinE;
  const m = FOLLOW_EDGE_MARGIN;
  const halfW = Math.min(width / MIN_TILE_PX / 2, mapW / 2 + m);
  const halfU = Math.min(usableDepth / 2, mapH / 2 + m);
  return {
    follow: true,
    target: {
      x: clamp(local.x, halfW - m, mapW + m - halfW),
      z: clamp(local.y, halfU - FOLLOW_BACK_MARGIN, mapH + m - halfU),
    },
    visibleDepth: fullDepth,
    viewOffsetY: inset > 0 ? -inset / 2 : 0,
  };
}

/** Sets the lens the framing assumes; call once per camera. */
export function setUpLens(camera: PerspectiveCamera): void {
  camera.fov = FOV;
  camera.near = CAMERA_NEAR;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();
}

/**
 * Applies the framing's view offset, touching the projection only when the offset or the canvas
 * size changed (the renderer recomputes the projection on resize; the offset follows it).
 */
function applyViewOffset(
  camera: PerspectiveCamera,
  offsetY: number,
  size: { width: number; height: number },
): void {
  const view = camera.view;
  if (offsetY === 0) {
    if (view?.enabled) {
      camera.clearViewOffset();
    }
    return;
  }
  if (
    view?.enabled &&
    view.offsetY === offsetY &&
    view.fullWidth === size.width &&
    view.fullHeight === size.height
  ) {
    return;
  }
  camera.setViewOffset(size.width, size.height, 0, offsetY, size.width, size.height);
}

/**
 * Places the camera above `focus` (the smoothed framing target) for `framing`, scaled by the
 * hit punch (1 = none) and displaced by the shake.
 */
export function placeCamera(
  camera: PerspectiveCamera,
  focus: Vector3,
  framing: Framing,
  size: { width: number; height: number },
  punch: number,
  shake: { x: number; y: number; roll: number },
): void {
  const vertical = framing.visibleDepth * Math.sin(ELEVATION);
  const distance = (vertical / 2 / Math.tan((FOV * Math.PI) / 360)) * punch;
  camera.position.set(
    focus.x + shake.x,
    Math.sin(ELEVATION) * distance,
    focus.z + Math.cos(ELEVATION) * distance + shake.y,
  );
  camera.lookAt(focus.x + shake.x, 0, focus.z + shake.y);
  camera.rotation.z += shake.roll;
  applyViewOffset(camera, framing.viewOffsetY, size);
}
