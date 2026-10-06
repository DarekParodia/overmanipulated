// Emitter presets as data (agents/game-feel.md). Colours come from design tokens.
import { palette } from '../../ui/tokens.ts';

export type EmitterPreset = {
  /** Base particle count before quality/reduced-motion scaling. */
  count: number;
  life: [min: number, max: number];
  size: [min: number, max: number];
  /** Horizontal speed range, tiles/s, random direction. */
  speed: [min: number, max: number];
  /** Initial upward speed range. */
  rise: [min: number, max: number];
  gravity: number;
  drag: number;
  /** Spawn height above the floor. */
  height: number;
  /** Colours to pick from; `null` = use the colour passed with the cue. */
  colors: readonly string[] | null;
};

export const particlePresets = {
  dust: {
    count: 4,
    life: [0.35, 0.6],
    size: [0.05, 0.09],
    speed: [0.3, 0.8],
    rise: [0.2, 0.6],
    gravity: 0.6,
    drag: 3,
    height: 0.03,
    colors: [palette.paperDeep, palette.paperShade, palette.inkFaint],
  },
  inkPuff: {
    count: 18,
    life: [0.5, 0.9],
    size: [0.07, 0.14],
    speed: [0.8, 2.2],
    rise: [0.8, 2.4],
    gravity: 3.5,
    drag: 2.2,
    height: 0.5,
    colors: null,
  },
  paperBits: {
    count: 14,
    life: [0.6, 1.1],
    size: [0.05, 0.1],
    speed: [1, 2.6],
    rise: [1.5, 3],
    gravity: 6,
    drag: 1.4,
    height: 0.6,
    colors: [palette.paper, palette.paperShade, palette.manila],
  },
} as const satisfies Record<string, EmitterPreset>;

export type ParticlePresetId = keyof typeof particlePresets;

/** Per-preset particle capacity of the shared pool by quality preset. */
export const particleCapacity = { low: 96, medium: 192, high: 384 } as const;
/** Fraction of particles spawned per quality preset. */
export const particleDensity = { low: 0.5, medium: 0.8, high: 1 } as const;
