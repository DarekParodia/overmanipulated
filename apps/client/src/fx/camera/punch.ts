// Camera zoom punch: a heavy impact (stamp slam, verdict) pushes the camera in a hair and lets it
// ease back, so the hit lands with weight. Pure and allocation-free; the camera rig applies it.

/** Decay rate: the punch loses ~63 % of its size every 1 / PUNCH_DECAY_PER_SECOND seconds. */
export const PUNCH_DECAY_PER_SECOND = 7;
/** Only impacts at least this strong (camera trauma) punch; routine ones just shake. */
export const PUNCH_MIN_TRAUMA = 0.3;
/** Fraction of the camera distance removed per unit of trauma. */
export const PUNCH_PER_TRAUMA = 0.07;
/** Never zoom in further than this fraction, however many impacts stack. */
export const PUNCH_MAX = 0.06;

export type PunchState = { amount: number };

export function createPunch(): PunchState {
  return { amount: 0 };
}

/** Adds a punch for an impact of the given trauma; weak impacts are ignored. */
export function addPunch(state: PunchState, trauma: number): void {
  if (trauma < PUNCH_MIN_TRAUMA) {
    return;
  }
  state.amount = Math.min(PUNCH_MAX, state.amount + trauma * PUNCH_PER_TRAUMA);
}

/** Advances the decay; returns the distance multiplier (1 = no punch). */
export function stepPunch(state: PunchState, dtSeconds: number): number {
  state.amount *= Math.exp(-PUNCH_DECAY_PER_SECOND * dtSeconds);
  if (state.amount < 0.0005) {
    state.amount = 0;
  }
  return 1 - state.amount;
}
