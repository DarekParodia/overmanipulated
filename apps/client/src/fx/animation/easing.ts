// Easing functions (t in [0, 1]). Paper and stamps move physically: settle with overshoot.
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number) => t ** 3;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

/** Overshoots then settles, like a sheet of paper landing. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}
