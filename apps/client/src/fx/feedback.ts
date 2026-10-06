// Feedback dispatcher: gameplay code emits named cues; this resolves each cue's layers against
// the catalogue and the player's settings and forwards them to whichever outputs are mounted
// (audio, particles, camera, haptics, animation listeners). FX never affect the simulation.
import { type QualityPreset, type Settings, useSettings } from '../store/settings.ts';
import { type AnimationTrigger, type AudioBus, type Cue, type CueId, cues } from './cues.ts';
import type { HapticPattern } from './haptics.ts';
import { type ParticlePresetId, particleDensity, particlePresets } from './particles/presets.ts';

export type CueContext = {
  /** World position in tiles (x, y on the floor). */
  position?: { x: number; y: number };
  /** Colour for presets without fixed colours (e.g. player colour). */
  color?: string;
  /** Which player the cue is about (for animation listeners). */
  playerId?: string;
};

export type FeedbackOutputs = {
  playSound?(
    ids: readonly string[],
    bus: AudioBus,
    volume: number,
    rateJitter: number,
    pan: number,
  ): void;
  spawnParticles?(preset: ParticlePresetId, count: number, context: CueContext): void;
  addTrauma?(amount: number): void;
  vibrate?(pattern: HapticPattern): void;
  /** Maps a world position to horizontal screen position in [-1, 1] for stereo panning. */
  screenX?(position: { x: number; y: number }): number;
};

export type AnimationListener = (trigger: AnimationTrigger, context: CueContext) => void;

/** Fewer particles with reduced motion, never zero (the information stays visible). */
const REDUCED_MOTION_PARTICLES = 0.4;
const PAN_WIDTH = 0.6;

export type ResolvedCue = {
  sound: Cue['sound'] | null;
  particles: { preset: ParticlePresetId; count: number } | null;
  shake: number;
  haptic: HapticPattern | null;
  animation: AnimationTrigger | null;
};

/** Pure: which layers of a cue run under the given settings. */
export function resolveCue(cue: Cue, settings: Settings, quality: QualityPreset): ResolvedCue {
  let particles: ResolvedCue['particles'] = null;
  if (cue.particles) {
    const base = cue.particles.count ?? particlePresets[cue.particles.preset].count;
    const scale =
      particleDensity[quality] * (settings.reducedMotion ? REDUCED_MOTION_PARTICLES : 1);
    const count = Math.max(1, Math.round(base * scale));
    particles = { preset: cue.particles.preset, count };
  }
  return {
    sound: settings.muted ? null : (cue.sound ?? null),
    particles,
    shake: settings.reducedMotion ? 0 : (cue.shake ?? 0),
    haptic: settings.haptics ? (cue.haptic ?? null) : null,
    animation: cue.animation ?? null,
  };
}

export function createFeedback(getSettings: () => Settings, getQuality: () => QualityPreset) {
  let outputs: FeedbackOutputs = {};
  const listeners = new Set<AnimationListener>();

  return {
    emit(id: CueId, context: CueContext = {}): void {
      const resolved = resolveCue(cues[id], getSettings(), getQuality());
      if (resolved.sound && outputs.playSound) {
        const pan =
          context.position && outputs.screenX
            ? Math.max(-1, Math.min(1, outputs.screenX(context.position))) * PAN_WIDTH
            : 0;
        outputs.playSound(
          resolved.sound.ids,
          resolved.sound.bus,
          resolved.sound.volume ?? 1,
          resolved.sound.rateJitter ?? 0,
          pan,
        );
      }
      if (resolved.particles && context.position) {
        outputs.spawnParticles?.(resolved.particles.preset, resolved.particles.count, context);
      }
      if (resolved.shake > 0) {
        outputs.addTrauma?.(resolved.shake);
      }
      if (resolved.haptic) {
        outputs.vibrate?.(resolved.haptic);
      }
      if (resolved.animation) {
        for (const listener of listeners) {
          listener(resolved.animation, context);
        }
      }
    },
    /** Mounts outputs (merged); returns a function that removes exactly these. */
    connect(partial: FeedbackOutputs): () => void {
      outputs = { ...outputs, ...partial };
      return () => {
        const next: FeedbackOutputs = { ...outputs };
        for (const key of Object.keys(partial) as (keyof FeedbackOutputs)[]) {
          if (next[key] === partial[key]) {
            delete next[key];
          }
        }
        outputs = next;
      };
    },
    onAnimation(listener: AnimationListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Current quality preset, set by the scene once the device has been probed. */
export const qualityState = { current: 'medium' as QualityPreset };

export const feedback = createFeedback(
  () => useSettings.getState(),
  () => qualityState.current,
);

/** The one entry point gameplay and UI code uses (agents/code-conventions.md). */
export function emitCue(id: CueId, context?: CueContext): void {
  feedback.emit(id, context);
}
