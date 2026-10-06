// The feedback catalogue (agents/game-feel.md): every cue's layers in one place. Tuning
// feedback means editing this file, not hunting through components.
import type { HapticPattern } from './haptics.ts';
import type { ParticlePresetId } from './particles/presets.ts';

export type AudioBus = 'ui' | 'sfx' | 'music';

export type SoundLayer = {
  /** One id, or several to pick from at random (variation). */
  ids: readonly string[];
  bus: AudioBus;
  volume?: number;
  /** Random playback-rate spread, e.g. 0.08 → 0.92–1.08. */
  rateJitter?: number;
};

/** Named animation triggers the scene or UI listens for. */
export type AnimationTrigger = 'spawnPop' | 'squash' | 'stampSlam';

export type Cue = {
  severity: 1 | 2 | 3;
  sound?: SoundLayer;
  particles?: { preset: ParticlePresetId; count?: number };
  /** Camera trauma 0..1 (skipped with reduced motion). */
  shake?: number;
  haptic?: HapticPattern;
  animation?: AnimationTrigger;
};

export const cues = {
  'ui.click': {
    severity: 1,
    sound: { ids: ['click'], bus: 'ui', rateJitter: 0.06 },
    haptic: 'tick',
  },
  'ui.hover': { severity: 1, sound: { ids: ['hover'], bus: 'ui', volume: 0.5, rateJitter: 0.1 } },
  'ui.back': { severity: 1, sound: { ids: ['back'], bus: 'ui' }, haptic: 'tick' },
  'ui.copy': { severity: 1, sound: { ids: ['copy'], bus: 'ui', volume: 0.8 }, haptic: 'tick' },
  'player.join': {
    severity: 1,
    sound: { ids: ['join'], bus: 'sfx', volume: 0.8 },
    particles: { preset: 'inkPuff' },
    animation: 'spawnPop',
  },
  'player.reconnect': {
    severity: 1,
    sound: { ids: ['join'], bus: 'sfx', volume: 0.5 },
    particles: { preset: 'inkPuff', count: 8 },
  },
  'player.leave': { severity: 1, sound: { ids: ['leave'], bus: 'sfx', volume: 0.7 } },
  'player.step': {
    severity: 1,
    sound: { ids: ['step1', 'step2'], bus: 'sfx', volume: 0.35, rateJitter: 0.12 },
    particles: { preset: 'dust', count: 1 },
  },
  'player.stepRemote': {
    severity: 1,
    sound: { ids: ['step1', 'step2'], bus: 'sfx', volume: 0.14, rateJitter: 0.12 },
    particles: { preset: 'dust', count: 1 },
  },
  'player.start': {
    severity: 1,
    particles: { preset: 'dust', count: 4 },
    animation: 'squash',
  },
  'player.stop': { severity: 1, animation: 'squash' },
  'game.start': {
    severity: 2,
    sound: { ids: ['start'], bus: 'sfx' },
    shake: 0.25,
    haptic: 'thud',
  },
  'stamp.applied': {
    severity: 2,
    sound: { ids: ['stamp'], bus: 'sfx', rateJitter: 0.05 },
    particles: { preset: 'paperBits' },
    shake: 0.35,
    haptic: 'thud',
    animation: 'stampSlam',
  },
  // S2-04 image search minigame (placeholder sounds until the sound unit lands).
  'imageSearch.fragment': {
    severity: 1,
    sound: { ids: ['hover'], bus: 'ui', volume: 0.8, rateJitter: 0.1 },
  },
  'imageSearch.match': {
    severity: 1,
    sound: { ids: ['stamp'], bus: 'ui', volume: 0.7, rateJitter: 0.05 },
    haptic: 'tick',
  },
  'imageSearch.miss': {
    severity: 1,
    sound: { ids: ['back'], bus: 'ui', rateJitter: 0.05 },
    haptic: 'thud',
  },
} as const satisfies Record<string, Cue>;

export type CueId = keyof typeof cues;
export const cueIds = Object.keys(cues) as CueId[];
