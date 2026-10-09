// HUD motion (S3-08): the HUD's side of the feedback catalogue. HUD components subscribe to the
// animation triggers aimed at them (`scorePop`, `credibilityCrack`, `timerPulse`, and the folder
// card trigger `cardHop`) and play short Web Animations on their own elements.
// Reduced motion: no scale, shake or bounce (only the static state change stays). No-flash: no
// pulsing; nothing here ever blinks.
import { useEffect, useRef } from 'react';
import type { AnimationTrigger } from '../fx/cues.ts';
import { type AnimationListener, type AnimationOptions, feedback } from '../fx/feedback.ts';

/** Bouncy overshoot curve, the same as `--ease-bounce` in tokens.css. */
export const EASE_BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/** Listens for the given HUD triggers; the handler may change between renders. */
export function useHudTrigger(
  triggers: readonly AnimationTrigger[],
  handler: AnimationListener,
): void {
  const latest = useRef(handler);
  latest.current = handler;
  const key = triggers.join(',');
  useEffect(() => {
    const wanted = new Set(key.split(','));
    return feedback.onAnimation((trigger, context, options) => {
      if (wanted.has(trigger)) {
        latest.current(trigger, context, options);
      }
    });
  }, [key]);
}

type Motion = { keyframes: Keyframe[]; options: KeyframeAnimationOptions };

/** Score number bump when points change. */
const bump: Motion = {
  keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(1)' }],
  options: { duration: 320, easing: EASE_BOUNCE },
};

/** Sideways shake for a cracked shield or a trembling card. */
const shake: Motion = {
  keyframes: [
    { transform: 'translateX(0) rotate(0deg)' },
    { transform: 'translateX(-5px) rotate(-4deg)' },
    { transform: 'translateX(5px) rotate(4deg)' },
    { transform: 'translateX(-4px) rotate(-3deg)' },
    { transform: 'translateX(3px) rotate(2deg)' },
    { transform: 'translateX(0) rotate(0deg)' },
  ],
  options: { duration: 420, easing: 'ease-out' },
};

/** Three strong beats of the level timer when the last seconds start. */
const pulse: Motion = {
  keyframes: [
    { transform: 'scale(1)' },
    { transform: 'scale(1.3)', offset: 0.15 },
    { transform: 'scale(1)', offset: 0.33 },
    { transform: 'scale(1.3)', offset: 0.48 },
    { transform: 'scale(1)', offset: 0.66 },
    { transform: 'scale(1.3)', offset: 0.81 },
    { transform: 'scale(1)' },
  ],
  options: { duration: 1100, easing: 'ease-in-out' },
};

/** Small hop (a folder got more time). */
const hop: Motion = {
  keyframes: [
    { transform: 'translateY(0) scale(1)' },
    { transform: 'translateY(-10px) scale(1.06)' },
    { transform: 'translateY(0) scale(1)' },
  ],
  options: { duration: 360, easing: EASE_BOUNCE },
};

export const hudMotions = { bump, shake, pulse, hop } as const;
export type HudMotion = keyof typeof hudMotions;

/** Whether a motion may play under the player's settings. */
export function motionAllowed(motion: HudMotion, options: AnimationOptions): boolean {
  if (options.reducedMotion) {
    return false;
  }
  // The pulse is the only rhythmic one: steady under no-flash (game-feel.md, `timerPulse`).
  return !(motion === 'pulse' && options.noFlash);
}

/** Plays a HUD motion on an element if the settings allow it (no-op without WAAPI). */
export function playMotion(
  element: Element | null | undefined,
  motion: HudMotion,
  options: AnimationOptions,
): void {
  if (!element || typeof element.animate !== 'function' || !motionAllowed(motion, options)) {
    return;
  }
  const { keyframes, options: timing } = hudMotions[motion];
  element.animate(keyframes, timing);
}
