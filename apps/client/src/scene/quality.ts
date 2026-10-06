// Quality presets and device detection (agents/platforms.md "Performance on mobile").
import { create } from 'zustand';
import { qualityState } from '../fx/feedback.ts';
import type { QualityPreset } from '../store/settings.ts';

export type QualityProfile = {
  preset: QualityPreset;
  maxDpr: number;
  shadows: boolean;
  /** Small decorative props (slides, cards, lamp) and the moving conveyor belt. */
  detail: boolean;
};

export function isCoarsePointer(): boolean {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    return false;
  }
}

/** Picks a starting preset from the GPU name and input type. */
export function detectPreset(rendererName: string, coarsePointer: boolean): QualityPreset {
  const gpu = rendererName.toLowerCase();
  if (coarsePointer) {
    return /mali-4|mali-t|adreno \(tm\) [3-5]|powervr|swiftshader/.test(gpu) ? 'low' : 'medium';
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
  };
}

export function lowerPreset(preset: QualityPreset): QualityPreset {
  return preset === 'high' ? 'medium' : 'low';
}

type QualityStore = {
  profile: QualityProfile;
  /** True when the preset was chosen automatically and may step down. */
  auto: boolean;
  set(profile: QualityProfile, auto: boolean): void;
};

export const useQuality = create<QualityStore>((set) => ({
  profile: profileFor('medium', isCoarsePointer(), globalThis.devicePixelRatio ?? 1),
  auto: true,
  set(profile, auto) {
    qualityState.current = profile.preset;
    set({ profile, auto });
  },
}));
