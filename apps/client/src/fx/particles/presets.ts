// Emitter presets as data (agents/game-feel.md). Colours come from design tokens.
import { colors } from '../../ui/tokens.ts';

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
  /** With `colors: null`: extra fixed colours mixed in with the cue colour. */
  accent?: readonly string[];
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
    colors: [colors.floorDark, colors.surface, colors.furnitureTop],
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
    colors: [colors.surface, colors.folder, colors.sky],
  },
  // --- S2-12 core gameplay feedback ---------------------------------------------------------
  /** A few sheets lifting as a folder lands on the conveyor. */
  paperFlutter: {
    count: 6,
    life: [0.5, 0.8],
    size: [0.05, 0.08],
    speed: [0.3, 0.9],
    rise: [0.8, 1.6],
    gravity: 3,
    drag: 2.5,
    height: 0.75,
    colors: [colors.surface, colors.folder, colors.surfaceSoft],
  },
  /** Flat ink drops thrown sideways from under a stamp. */
  inkSplat: {
    count: 10,
    life: [0.45, 0.7],
    size: [0.04, 0.08],
    speed: [1.4, 2.8],
    rise: [0.1, 0.5],
    gravity: 8,
    drag: 4,
    height: 0.62,
    colors: [colors.outline, colors.textSoft],
  },
  /** Verdict celebration: chips in the verdict colour mixed with white and sky blue. */
  confetti: {
    count: 26,
    life: [0.8, 1.3],
    size: [0.05, 0.09],
    speed: [0.8, 2.2],
    rise: [2.4, 4],
    gravity: 5,
    drag: 1.6,
    height: 0.7,
    colors: null,
    accent: [colors.surface, colors.sky],
  },
  /** Published fake: heavy red ink thrown up and splattering down. */
  redInk: {
    count: 28,
    life: [0.7, 1.2],
    size: [0.07, 0.15],
    speed: [1.2, 3],
    rise: [1.6, 3.4],
    gravity: 9,
    drag: 1.2,
    height: 0.7,
    colors: [colors.red, colors.redDark, colors.outline],
  },
  /** Crumpled folder falling apart into grey dust. */
  ash: {
    count: 16,
    life: [0.8, 1.4],
    size: [0.04, 0.09],
    speed: [0.3, 1],
    rise: [0.3, 1],
    gravity: 1.2,
    drag: 2.5,
    height: 0.65,
    colors: [colors.textFaint, colors.textSoft, colors.surfaceSunk],
  },
  /** Small grey wisp rising from a failed minigame (negative gravity lifts it). */
  smoke: {
    count: 6,
    life: [0.6, 1],
    size: [0.06, 0.11],
    speed: [0.1, 0.4],
    rise: [0.4, 0.8],
    gravity: -0.6,
    drag: 1.5,
    height: 1,
    colors: [colors.textFaint, colors.surfaceSunk],
  },
  // --- S4-05 level events -------------------------------------------------------------------
  /** Shares piling up: orange and red chips popping upwards, with white sparkles. */
  shareBurst: {
    count: 24,
    life: [0.7, 1.2],
    size: [0.06, 0.11],
    speed: [0.6, 1.8],
    rise: [2, 3.6],
    gravity: 3,
    drag: 1.6,
    height: 0.9,
    colors: [colors.orange, colors.red, colors.surface],
  },
  /** Alarm (boss call, correction): red and yellow dots thrown out like a ringing bell. */
  alertBurst: {
    count: 20,
    life: [0.5, 0.9],
    size: [0.06, 0.12],
    speed: [1.4, 2.8],
    rise: [0.6, 1.8],
    gravity: 4,
    drag: 2,
    height: 0.9,
    colors: [colors.red, colors.yellow, colors.surface],
  },
  /** Bot raid: hard-edged blue, red and navy squares jittering out (a glitch). */
  glitchBits: {
    count: 26,
    life: [0.35, 0.8],
    size: [0.05, 0.13],
    speed: [1, 3],
    rise: [0.2, 1.4],
    gravity: 1,
    drag: 3,
    height: 0.6,
    colors: [colors.blue, colors.red, colors.outline, colors.surface],
  },
  /** Electric sparks from a station that went down. */
  sparks: {
    count: 14,
    life: [0.25, 0.55],
    size: [0.03, 0.06],
    speed: [0.8, 2.2],
    rise: [1.2, 2.8],
    gravity: 9,
    drag: 1.2,
    height: 1,
    colors: [colors.yellow, colors.orange, colors.surface],
  },
} as const satisfies Record<string, EmitterPreset>;

export type ParticlePresetId = keyof typeof particlePresets;

/** Per-preset particle capacity of the shared pool by quality preset. */
export const particleCapacity = { low: 96, medium: 192, high: 384 } as const;
/** Fraction of particles spawned per quality preset. */
export const particleDensity = { low: 0.5, medium: 0.8, high: 1 } as const;
