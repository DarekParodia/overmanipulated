// The camera shake and zoom punch of one GameView (net/game-view.ts, S7-85): impacts from the
// view's own feedback move only this view's camera.
import { addPunch, createPunch, type PunchState } from './punch.ts';
import { addTrauma, createShake, type ShakeState } from './shake.ts';

export type ViewCamera = { readonly shake: ShakeState; readonly punch: PunchState };

export function createViewCamera(): ViewCamera {
  return { shake: createShake(), punch: createPunch() };
}

/** One impact: trauma for the shake, and a punch when it is heavy enough. */
export function hitCamera(camera: ViewCamera, amount: number): void {
  addTrauma(camera.shake, amount);
  addPunch(camera.punch, amount);
}

/** Back to rest (a camera rig mounting starts calm, as with fresh state). */
export function settleCamera(camera: ViewCamera): void {
  Object.assign(camera.shake, createShake());
  Object.assign(camera.punch, createPunch());
}
