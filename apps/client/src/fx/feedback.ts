// Feedback dispatcher: gameplay code emits named cues; this resolves each cue's layers against
// the catalogue and the player's settings and forwards them to whichever outputs are mounted
// (audio, particles, camera, haptics, animation listeners). FX never affect the simulation.
import { type QualityPreset, type Settings, useSettings } from '../store/settings.ts';
import {
  type AnimationTrigger,
  type AudioBus,
  type Cue,
  type CueId,
  cues,
  type LoopId,
  type ParticleLayer,
} from './cues.ts';
import type { HapticPattern } from './haptics.ts';
import { type ParticlePresetId, particleDensity, particlePresets } from './particles/presets.ts';

export type CueContext = {
  /** World position in tiles (x, y on the floor). */
  position?: { x: number; y: number };
  /** Colour for presets without fixed colours (e.g. player colour). */
  color?: string;
  /** Which player the cue is about (for animation listeners). */
  playerId?: string;
  /** True when the cue is about another player: haptics are skipped (not your hands). */
  remote?: boolean;
  /** Folder / fixture the cue is about (for animation listeners). */
  folderId?: string;
  fixtureId?: string;
  /** A number to show, e.g. the score delta for `scorePop`. */
  value?: number;
  /** Key of the looping sound a cue starts or stops (e.g. the station id). */
  loopKey?: string;
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
  /** Briefly freezes the FX clock (fx/time-scale.ts). */
  hitStop?(ms: number): void;
  startLoop?(key: string, loop: LoopId): void;
  /** Stops the loop under `key`, or every loop when omitted. */
  stopLoop?(key?: string): void;
};

/** Accessibility flags animation listeners must honour (no squash/shake, no blinking). */
export type AnimationOptions = { reducedMotion: boolean; noFlash: boolean };

export type AnimationListener = (
  trigger: AnimationTrigger,
  context: CueContext,
  options: AnimationOptions,
) => void;

/** Fewer particles with reduced motion, never zero (the information stays visible). */
const REDUCED_MOTION_PARTICLES = 0.4;
const PAN_WIDTH = 0.6;

type ResolvedParticles = { preset: ParticlePresetId; count: number };

export type ResolvedCue = {
  sound: Cue['sound'] | null;
  particles: ResolvedParticles | null;
  extraParticles: ResolvedParticles | null;
  shake: number;
  hitStopMs: number;
  haptic: HapticPattern | null;
  animations: readonly AnimationTrigger[];
  loop: Cue['loop'] | null;
};

const NO_ANIMATIONS: readonly AnimationTrigger[] = [];

function resolveParticles(
  layer: ParticleLayer | undefined,
  settings: Settings,
  quality: QualityPreset,
): ResolvedParticles | null {
  if (!layer) {
    return null;
  }
  const base = layer.count ?? particlePresets[layer.preset].count;
  const scale = particleDensity[quality] * (settings.reducedMotion ? REDUCED_MOTION_PARTICLES : 1);
  return { preset: layer.preset, count: Math.max(1, Math.round(base * scale)) };
}

/** Pure: which layers of a cue run under the given settings. */
export function resolveCue(cue: Cue, settings: Settings, quality: QualityPreset): ResolvedCue {
  const animation = cue.animation;
  return {
    sound: settings.muted ? null : (cue.sound ?? null),
    particles: resolveParticles(cue.particles, settings, quality),
    extraParticles: resolveParticles(cue.extraParticles, settings, quality),
    shake: settings.reducedMotion ? 0 : (cue.shake ?? 0),
    hitStopMs: settings.reducedMotion ? 0 : (cue.hitStopMs ?? 0),
    haptic: settings.haptics ? (cue.haptic ?? null) : null,
    animations:
      animation === undefined
        ? NO_ANIMATIONS
        : typeof animation === 'string'
          ? [animation]
          : animation,
    loop: cue.loop ?? null,
  };
}

export function createFeedback(getSettings: () => Settings, getQuality: () => QualityPreset) {
  let outputs: FeedbackOutputs = {};
  const listeners = new Set<AnimationListener>();

  return {
    emit(id: CueId, context: CueContext = {}): void {
      const settings = getSettings();
      const resolved = resolveCue(cues[id], settings, getQuality());
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
      if (resolved.loop === 'stopAll') {
        outputs.stopLoop?.();
      } else if (resolved.loop === 'stop') {
        if (context.loopKey) {
          outputs.stopLoop?.(context.loopKey);
        }
      } else if (resolved.loop && context.loopKey) {
        outputs.startLoop?.(context.loopKey, resolved.loop);
      }
      if (context.position) {
        for (const particles of [resolved.particles, resolved.extraParticles]) {
          if (particles) {
            outputs.spawnParticles?.(particles.preset, particles.count, context);
          }
        }
      }
      // Hit-stop freezes everyone's FX, so only your own impacts trigger it.
      if (resolved.hitStopMs > 0 && !context.remote) {
        outputs.hitStop?.(resolved.hitStopMs);
      }
      if (resolved.shake > 0) {
        outputs.addTrauma?.(resolved.shake);
      }
      if (resolved.haptic && !context.remote) {
        outputs.vibrate?.(resolved.haptic);
      }
      if (resolved.animations.length > 0) {
        const options = { reducedMotion: settings.reducedMotion, noFlash: settings.noFlash };
        for (const trigger of resolved.animations) {
          for (const listener of listeners) {
            listener(trigger, context, options);
          }
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
