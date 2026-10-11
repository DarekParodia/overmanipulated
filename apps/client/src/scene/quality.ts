// Quality presets, device detection and the degrade ladder used by adaptive quality
// (agents/platforms.md "Performance on mobile"; the controller lives in adaptive-quality.ts).
import { create } from 'zustand';
import { qualityState } from '../fx/feedback.ts';
import type { QualityPreset } from '../store/settings.ts';

export type QualityProfile = {
  preset: QualityPreset;
  maxDpr: number;
  shadows: boolean;
  /** Small decorative props (slides, cards, lamp) and the moving conveyor belt. */
  detail: boolean;
  /** Share of requested particles that is actually spawned (1 = all). */
  particleScale: number;
  /** Ambient dust motes in the light columns. */
  motes: boolean;
  /** Inverted-hull navy outline around the characters. */
  outlines: boolean;
};

export function isCoarsePointer(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}

/** What the browser tells us about the hardware; both values are missing on Safari/Firefox. */
export type DeviceHints = { deviceMemoryGb?: number | undefined; cores?: number | undefined };

export function deviceHints(): DeviceHints {
  try {
    const nav = globalThis.navigator as Navigator & { deviceMemory?: number };
    return { deviceMemoryGb: nav?.deviceMemory, cores: nav?.hardwareConcurrency };
  } catch {
    return {};
  }
}

const WEAK_PHONE_GPU = /mali-4|mali-t|adreno \(tm\) [3-5]|powervr|swiftshader/;
/** Phones with this little memory or this few cores start on the lowest preset. */
const WEAK_PHONE_MEMORY_GB = 4;
const WEAK_PHONE_CORES = 4;

/** Picks a starting preset from the GPU name, input type and (when known) memory and cores. */
export function detectPreset(
  rendererName: string,
  coarsePointer: boolean,
  hints: DeviceHints = {},
): QualityPreset {
  const gpu = rendererName.toLowerCase();
  if (coarsePointer) {
    const weak =
      (hints.deviceMemoryGb !== undefined && hints.deviceMemoryGb <= WEAK_PHONE_MEMORY_GB) ||
      (hints.cores !== undefined && hints.cores <= WEAK_PHONE_CORES);
    // Phones never start on high: low for weak ones, medium for the rest.
    return WEAK_PHONE_GPU.test(gpu) || weak ? 'low' : 'medium';
  }
  if (/swiftshader|llvmpipe|software/.test(gpu)) {
    return 'low';
  }
  return /intel|uhd|iris|hd graphics/.test(gpu) ? 'medium' : 'high';
}

export function profileFor(
  preset: QualityPreset,
  coarsePointer: boolean,
  deviceDpr: number,
): QualityProfile {
  const cap = coarsePointer ? 1.5 : 2;
  const dprByPreset = { low: 1, medium: 1.5, high: 2 } as const;
  return {
    preset,
    maxDpr: Math.min(cap, dprByPreset[preset], Math.max(1, deviceDpr)),
    shadows: preset === 'high',
    detail: preset !== 'low',
    particleScale: 1,
    motes: preset === 'high',
    outlines: true,
  };
}

/** Share of the particle budget kept once adaptive quality starts cutting. */
export const DEGRADED_PARTICLE_SCALE = 0.5;
/** DPR is lowered to this fraction of the preset's cap (never below 1). */
export const DEGRADED_DPR_FACTOR = 0.75;

/**
 * The degrade ladder for one base profile: index 0 is the profile itself, every next entry cuts
 * one more thing, cheapest-to-lose first: particles and motes, shadows, resolution, small props,
 * character outlines. Steps that would change nothing (e.g. shadows on a preset without shadows)
 * are skipped, so every step is a real saving.
 */
export function degradeLadder(base: QualityProfile): QualityProfile[] {
  const steps: ((p: QualityProfile) => QualityProfile)[] = [
    (p) => ({ ...p, particleScale: DEGRADED_PARTICLE_SCALE, motes: false }),
    (p) => ({ ...p, shadows: false }),
    (p) => ({ ...p, maxDpr: Math.max(1, p.maxDpr * DEGRADED_DPR_FACTOR) }),
    (p) => ({ ...p, detail: false }),
    (p) => ({ ...p, outlines: false }),
  ];
  const ladder = [base];
  for (const step of steps) {
    const previous = ladder[ladder.length - 1] ?? base;
    const next = step(previous);
    if (JSON.stringify(next) !== JSON.stringify(previous)) {
      ladder.push(next);
    }
  }
  return ladder;
}

type QualityStore = {
  /** The profile in effect: the base preset with `stage` degrade steps applied. */
  profile: QualityProfile;
  /** The undegraded profile for the chosen or detected preset. */
  base: QualityProfile;
  /** Number of degrade steps currently applied (0 = none). */
  stage: number;
  /** True when the preset was chosen automatically and may step down. */
  auto: boolean;
  /** Picks a new base preset and clears any degradation. */
  choose(base: QualityProfile, auto: boolean): void;
  /** Applies the given degrade step of the current base's ladder. */
  setStage(stage: number): void;
};

function initialBase(): QualityProfile {
  return profileFor('medium', isCoarsePointer(), globalThis.devicePixelRatio ?? 1);
}

export const useQuality = create<QualityStore>((set, get) => ({
  profile: initialBase(),
  base: initialBase(),
  stage: 0,
  auto: true,
  choose(base, auto) {
    qualityState.current = base.preset;
    set({ base, profile: base, stage: 0, auto });
  },
  setStage(stage) {
    const ladder = degradeLadder(get().base);
    const clamped = Math.max(0, Math.min(ladder.length - 1, stage));
    set({ stage: clamped, profile: ladder[clamped] ?? get().base });
  },
}));
