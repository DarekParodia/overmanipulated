// Haptics: Vibration API (Android; iOS ignores it) and gamepad rumble where available.
export const hapticPatterns = {
  tick: [8],
  thud: [28],
  buzz: [50, 40, 60],
} as const;

export type HapticPattern = keyof typeof hapticPatterns;

const rumble: Record<HapticPattern, { duration: number; strong: number; weak: number }> = {
  tick: { duration: 30, strong: 0, weak: 0.3 },
  thud: { duration: 80, strong: 0.5, weak: 0.4 },
  buzz: { duration: 220, strong: 0.8, weak: 0.6 },
};

type RumbleActuator = {
  playEffect?: (
    type: 'dual-rumble',
    params: { duration: number; strongMagnitude: number; weakMagnitude: number },
  ) => Promise<unknown>;
};

export function vibrate(pattern: HapticPattern): void {
  try {
    navigator.vibrate?.([...hapticPatterns[pattern]]);
  } catch {
    // Not supported or blocked.
  }
  try {
    for (const pad of navigator.getGamepads?.() ?? []) {
      const actuator = (pad as (Gamepad & { vibrationActuator?: RumbleActuator }) | null)
        ?.vibrationActuator;
      const effect = rumble[pattern];
      void actuator?.playEffect?.('dual-rumble', {
        duration: effect.duration,
        strongMagnitude: effect.strong,
        weakMagnitude: effect.weak,
      });
    }
  } catch {
    // Gamepad API blocked.
  }
}
