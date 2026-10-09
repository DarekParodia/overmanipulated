// Mix rules (S5-08), pure: bus trims, when the voice-less chatter bed plays, and how it follows
// ducking. The WebAudio graph itself (master limiter) lives in audio-manager.ts.
import type { Settings } from '../../store/settings.ts';
import type { AudioBus } from '../cues.ts';
import { AMBIENCE_TUNING } from './ambience.ts';

type MixSettings = Pick<Settings, 'muted' | 'masterVolume' | 'sfxVolume' | 'quality'>;

/**
 * Per-bus trim on top of master × the bus slider. Files are normalised per class
 * (tools/audio/synth_*.py, docs/audio.md); these only balance the buses against each other.
 */
export const BUS_TRIM: Readonly<Record<AudioBus, number>> = {
  music: 1,
  sfx: 1,
  ui: 0.9,
};

/** Master limiter (a DynamicsCompressor on the master bus): catches stacked stingers. */
export const LIMITER = {
  thresholdDb: -9,
  kneeDb: 6,
  ratio: 12,
  attackS: 0.003,
  releaseS: 0.18,
} as const;

export const CHATTER = {
  /** Level of the chatter bed relative to the sfx bus, before ducking. */
  level: 0.5,
  /** Gain while an overlay (station, desk, results) is open: deeper than the ambience's duck. */
  duckedGain: 0.15,
  /** Below this effective sfx volume (master × sfx) the bed is left out entirely. */
  minSfxVolume: 0.12,
} as const;

/** Reduced-audio setups: muted, nearly silent sfx, or the low quality preset (weak phones). */
export function reducedAudio(settings: MixSettings): boolean {
  return (
    settings.muted ||
    settings.quality === 'low' ||
    settings.masterVolume * settings.sfxVolume < CHATTER.minSfxVolume
  );
}

/**
 * Playback volume of the chatter bed. `bedGain` is the ambience bed's gain (1 normally, down to
 * AMBIENCE_TUNING.duckedGain under overlays); the chatter follows it down to CHATTER.duckedGain.
 * Returns 0 in reduced-audio setups.
 */
export function chatterVolume(settings: MixSettings, bedGain: number): number {
  if (reducedAudio(settings)) {
    return 0;
  }
  const lowest = AMBIENCE_TUNING.duckedGain;
  const open = Math.min(1, Math.max(0, (bedGain - lowest) / (1 - lowest)));
  const gain = CHATTER.duckedGain + (1 - CHATTER.duckedGain) * open;
  return settings.masterVolume * settings.sfxVolume * CHATTER.level * gain;
}
