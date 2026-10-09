// Haptics (S5-10): Vibration API patterns (Android; iOS ignores them) and gamepad dual-rumble.
// One pattern per feeling — tick, thud, success, error, alarm — shared by phone and pad, scaled
// by the "rumbleIntensity" setting and silent with "haptics" off. Everything is optional: a
// missing API or a blocked call never throws.
import { useSettings } from '../store/settings.ts';

/**
 * Vibration timelines in ms, alternating vibrate / pause / vibrate … (Vibration API format).
 * Short and sharp for UI, rising rhythm for good news, double knock for mistakes, long
 * insistent pulses for alarms.
 */
export const hapticPatterns = {
  /** UI press, pick-up, small confirmations. */
  tick: [8],
  /** Impacts: stamp, desk, level start. */
  thud: [28],
  /** Good news: two soft taps rising into a firm one. */
  success: [12, 45, 24],
  /** Mistakes: a double knock. */
  error: [45, 40, 45],
  /** Emergencies: boss call, raid, fake published, defeat. */
  alarm: [90, 50, 90, 50, 160],
} as const satisfies Record<string, readonly number[]>;

export type HapticPattern = keyof typeof hapticPatterns;

export const hapticPatternIds = Object.keys(hapticPatterns) as HapticPattern[];

/** One dual-rumble pulse of a gamepad effect; magnitudes 0..1 before intensity scaling. */
export type RumbleStep = {
  /** ms from the start of the effect. */
  start: number;
  duration: number;
  /** Low-frequency (heavy) motor. */
  strong: number;
  /** High-frequency (light) motor. */
  weak: number;
};

export const rumblePatterns: Record<HapticPattern, readonly RumbleStep[]> = {
  tick: [{ start: 0, duration: 30, strong: 0, weak: 0.3 }],
  thud: [{ start: 0, duration: 80, strong: 0.5, weak: 0.4 }],
  success: [
    { start: 0, duration: 40, strong: 0, weak: 0.4 },
    { start: 90, duration: 120, strong: 0.35, weak: 0.5 },
  ],
  error: [
    { start: 0, duration: 90, strong: 0.7, weak: 0.3 },
    { start: 140, duration: 90, strong: 0.7, weak: 0.3 },
  ],
  alarm: [
    { start: 0, duration: 160, strong: 0.9, weak: 0.7 },
    { start: 220, duration: 160, strong: 0.9, weak: 0.7 },
    { start: 440, duration: 320, strong: 1, weak: 0.8 },
  ],
};

/** Pulses shorter than this do nothing on a phone motor; they are dropped, not stretched. */
export const MIN_PULSE_MS = 4;

export type HapticSettings = { haptics: boolean; rumbleIntensity: number };

export type HapticPlan = {
  /** Argument for `navigator.vibrate`, or null when nothing should buzz. */
  vibration: number[] | null;
  rumble: RumbleStep[];
};

const NONE: HapticPlan = { vibration: null, rumble: [] };

/**
 * Pure: what a pattern does under the given settings. Intensity scales the length of every
 * vibration pulse (pauses stay) and the rumble magnitudes; 0 or `haptics: false` is silent.
 */
export function planHaptic(pattern: HapticPattern, settings: HapticSettings): HapticPlan {
  const intensity = Math.max(0, Math.min(1, settings.rumbleIntensity));
  if (!settings.haptics || intensity === 0) {
    return NONE;
  }
  const timeline: number[] = [];
  hapticPatterns[pattern].forEach((ms, index) => {
    // Even indices vibrate, odd ones pause.
    timeline.push(index % 2 === 0 ? Math.round(ms * intensity) : ms);
  });
  const vibration = timeline.some((ms, index) => index % 2 === 0 && ms >= MIN_PULSE_MS)
    ? timeline
    : null;
  const rumble = rumblePatterns[pattern].map((step) => ({
    ...step,
    strong: Math.min(1, step.strong * intensity),
    weak: Math.min(1, step.weak * intensity),
  }));
  return { vibration, rumble };
}

type RumbleActuator = {
  playEffect?: (
    type: 'dual-rumble',
    params: {
      startDelay?: number;
      duration: number;
      strongMagnitude: number;
      weakMagnitude: number;
    },
  ) => Promise<unknown>;
};

type PulseActuator = { pulse?: (value: number, duration: number) => Promise<unknown> };

type HapticPad = Gamepad & {
  vibrationActuator?: RumbleActuator | null;
  /** Older Firefox builds. */
  hapticActuators?: readonly PulseActuator[];
};

/** Browser surface the haptics touch; injectable for tests. */
export type HapticEnvironment = {
  vibrate?: (pattern: number[]) => boolean;
  gamepads?: () => readonly (Gamepad | null)[];
};

function browserEnvironment(): HapticEnvironment {
  return {
    ...(typeof navigator !== 'undefined' && navigator.vibrate
      ? { vibrate: (pattern: number[]) => navigator.vibrate(pattern) }
      : {}),
    ...(typeof navigator !== 'undefined' && navigator.getGamepads
      ? { gamepads: () => navigator.getGamepads() }
      : {}),
  };
}

/** Plays a plan on whatever the device offers. Never throws. */
export function playPlan(plan: HapticPlan, env: HapticEnvironment): void {
  if (plan.vibration) {
    try {
      env.vibrate?.(plan.vibration);
    } catch {
      // Not supported, or blocked until the first tap.
    }
  }
  if (plan.rumble.length === 0) {
    return;
  }
  try {
    for (const pad of env.gamepads?.() ?? []) {
      if (!pad?.connected) {
        continue;
      }
      const { vibrationActuator, hapticActuators } = pad as HapticPad;
      if (vibrationActuator?.playEffect) {
        for (const step of plan.rumble) {
          void vibrationActuator
            .playEffect('dual-rumble', {
              startDelay: step.start,
              duration: step.duration,
              strongMagnitude: step.strong,
              weakMagnitude: step.weak,
            })
            ?.catch?.(() => {});
        }
      } else if (hapticActuators?.[0]?.pulse) {
        // Legacy single-motor API: one pulse at the strongest magnitude of the effect.
        const strongest = Math.max(...plan.rumble.map((s) => Math.max(s.strong, s.weak)));
        const last = plan.rumble[plan.rumble.length - 1];
        const total = last ? last.start + last.duration : 0;
        void hapticActuators[0].pulse(strongest, total)?.catch?.(() => {});
      }
    }
  } catch {
    // Gamepad API blocked.
  }
}

/** Entry point used by the feedback bus (App connects it as the `vibrate` output). */
export function vibrate(pattern: HapticPattern): void {
  const { haptics, rumbleIntensity } = useSettings.getState();
  playPlan(planHaptic(pattern, { haptics, rumbleIntensity }), browserEnvironment());
}
