import { describe, expect, it } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { ENDLESS_LEVEL_ID } from '@redakcja/shared';
import { AMBIENCE_TUNING } from './ambience.ts';
import { createDucker, DUCK_TUNING, DUCKING_SOUNDS } from './duck.ts';
import { BUS_TRIM, CHATTER, chatterVolume, reducedAudio } from './mix.ts';
import {
  CALM_DIP_AT_FULL,
  layerGains,
  slew,
  TRACK_SETS,
  trackSetForLevel,
} from './music-intensity.ts';
import manifest from './music-manifest.json';
import sprite from './sfx-sprite.json';

const AUDIO_DIR = new URL('../../../public/assets/audio/', import.meta.url).pathname;
const settings = { muted: false, masterVolume: 0.8, sfxVolume: 0.9, quality: null } as const;

describe('level music selection', () => {
  it('maps every campaign level and endless mode to its own track set', () => {
    expect(trackSetForLevel('l1-burza')).toBe('l1');
    expect(trackSetForLevel('l2-wybory')).toBe('l2');
    expect(trackSetForLevel('l3-afera')).toBe('l3');
    expect(trackSetForLevel('l4-zdrowie')).toBe('l4');
    expect(trackSetForLevel('l5-deepfake')).toBe('l5');
    expect(trackSetForLevel('l6-atak')).toBe('l6');
    expect(trackSetForLevel(ENDLESS_LEVEL_ID)).toBe('endless');
  });

  it('falls back to the first level for the greybox, unknown ids and no room', () => {
    expect(trackSetForLevel('l0-greybox')).toBe('l1');
    expect(trackSetForLevel('l7-future')).toBe('l1');
    expect(trackSetForLevel('')).toBe('l1');
    expect(trackSetForLevel(undefined)).toBe('l1');
    expect(trackSetForLevel(null)).toBe('l1');
  });

  it('ships both layers of every set in both formats, with a manifest loop length', () => {
    const files = ['menu', ...TRACK_SETS.flatMap((set) => [set, `${set}-pressure`])];
    for (const file of files) {
      for (const ext of ['webm', 'mp3']) {
        const path = `${AUDIO_DIR}music/${file}.${ext}`;
        expect(existsSync(path)).toBe(true);
        expect(statSync(path).size).toBeGreaterThan(20_000);
      }
    }
    for (const set of ['menu', ...TRACK_SETS]) {
      const entry = (manifest as Record<string, { bpm: number; loopMs: number }>)[set];
      expect(entry).toBeDefined();
      // 16 bars of 4/4 at the track's tempo.
      expect(entry?.loopMs).toBeCloseTo(((16 * 4 * 60) / (entry?.bpm ?? 1)) * 1000, 0);
    }
  });

  it('gives every level its own tempo', () => {
    const tempos = TRACK_SETS.map((set) => (manifest as Record<string, { bpm: number }>)[set]?.bpm);
    expect(new Set(tempos).size).toBe(TRACK_SETS.length);
  });
});

describe('layer cross-fade', () => {
  it('is all calm at zero intensity and hands over to pressure at full intensity', () => {
    expect(layerGains(1, 0)).toEqual({ calm: 1, pressure: 0 });
    const full = layerGains(1, 1);
    expect(full.pressure).toBe(1);
    expect(full.calm).toBeCloseTo(1 - CALM_DIP_AT_FULL);
  });

  it('scales both layers with the scene gain (scene cross-fade)', () => {
    const half = layerGains(0.5, 0.5);
    const full = layerGains(1, 0.5);
    expect(half.calm).toBeCloseTo(full.calm / 2);
    expect(half.pressure).toBeCloseTo(full.pressure / 2);
    expect(layerGains(0, 1)).toEqual({ calm: 0, pressure: 0 });
  });

  it('keeps the total level roughly steady while the intensity rises', () => {
    // File levels: calm -21 dB, pressure -23 dB RMS (tools/audio/synth_music.py).
    const power = (intensity: number) => {
      const g = layerGains(1, intensity);
      return g.calm ** 2 * 10 ** -2.1 + g.pressure ** 2 * 10 ** -2.3;
    };
    const lo = 10 * Math.log10(power(0));
    const hi = 10 * Math.log10(power(1));
    expect(Math.abs(hi - lo)).toBeLessThan(2.5);
  });

  it('cross-fades scenes at the tuned speed without overshoot', () => {
    let gain = 0;
    for (let i = 0; i < 100; i++) {
      gain = slew(gain, 1, 0.7, 0.7, 0.05);
    }
    expect(gain).toBe(1);
    expect(slew(1, 0, 0.7, 0.7, 0.5)).toBeCloseTo(0.65);
  });
});

describe('music ducking', () => {
  it('dips under a stinger and recovers afterwards', () => {
    const ducker = createDucker();
    let now = 0;
    const step = (ms: number) => {
      now += ms;
      return ducker.step(now, ms / 1000);
    };
    expect(step(50)).toBe(1);
    ducker.request(now, 1000);
    let low = 1;
    for (let i = 0; i < 20; i++) {
      low = Math.min(low, step(50));
    }
    expect(low).toBe(DUCK_TUNING.depth);
    for (let i = 0; i < 80; i++) {
      step(50);
    }
    expect(ducker.gain()).toBe(1);
  });

  it('keeps the later deadline and ignores very short sounds', () => {
    const ducker = createDucker();
    ducker.request(0, 2000);
    ducker.request(0, 500);
    expect(ducker.step(1500, 10)).toBe(DUCK_TUNING.depth);
    const short = createDucker();
    short.request(0, DUCK_TUNING.minMs - 1);
    expect(short.step(10, 1)).toBe(1);
  });

  it('only names sounds that exist in the sprite', () => {
    for (const id of Object.keys(DUCKING_SOUNDS)) {
      expect(id in sprite).toBe(true);
    }
  });
});

describe('chatter bed and bus defaults', () => {
  it('ships the chatter loop in the sprite', () => {
    expect((sprite as unknown as Record<string, [number, number, boolean]>).ambchatter?.[2]).toBe(
      true,
    );
  });

  it('plays quietly, ducks under overlays and goes silent in reduced-audio setups', () => {
    const open = chatterVolume(settings, 1);
    const ducked = chatterVolume(settings, AMBIENCE_TUNING.duckedGain);
    expect(open).toBeGreaterThan(0);
    expect(open).toBeLessThan(settings.masterVolume * settings.sfxVolume * 0.6);
    expect(ducked / open).toBeCloseTo(CHATTER.duckedGain);
    expect(chatterVolume({ ...settings, muted: true }, 1)).toBe(0);
    expect(chatterVolume({ ...settings, quality: 'low' }, 1)).toBe(0);
    expect(chatterVolume({ ...settings, sfxVolume: 0.05 }, 1)).toBe(0);
    expect(reducedAudio(settings)).toBe(false);
  });

  it('has a trim for every bus and never boosts one', () => {
    for (const bus of ['music', 'sfx', 'ui'] as const) {
      expect(BUS_TRIM[bus]).toBeGreaterThan(0);
      expect(BUS_TRIM[bus]).toBeLessThanOrEqual(1);
    }
  });
});
