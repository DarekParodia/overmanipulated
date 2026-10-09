import { describe, expect, test } from 'bun:test';
import { defaultSettings } from '../store/settings.ts';
import {
  controlRows,
  keyLabel,
  nextTab,
  qualityNote,
  sliderSpecs,
  stepSlider,
} from './settings-model.ts';

describe('stepSlider', () => {
  test('steps without float drift', () => {
    let value = 0;
    for (let i = 0; i < 7; i++) {
      value = stepSlider(value, 1, sliderSpecs.volume);
    }
    expect(value).toBe(0.35);
  });

  test('clamps to the range', () => {
    expect(stepSlider(1, 1, sliderSpecs.volume)).toBe(1);
    expect(stepSlider(0, -1, sliderSpecs.volume)).toBe(0);
    expect(stepSlider(1.4, 1, sliderSpecs.textScale)).toBe(1.4);
    expect(stepSlider(0.8, -1, sliderSpecs.touchScale)).toBe(0.8);
  });

  test('snaps off-grid values onto the grid', () => {
    expect(stepSlider(0.87, 1, sliderSpecs.touchOpacity)).toBe(0.9);
    expect(stepSlider(1.04, 1, sliderSpecs.textScale)).toBe(1.1);
  });
});

describe('defaults', () => {
  test('are inside every slider range', () => {
    const d = defaultSettings();
    const checks = [
      [d.masterVolume, sliderSpecs.volume],
      [d.musicVolume, sliderSpecs.volume],
      [d.sfxVolume, sliderSpecs.volume],
      [d.uiVolume, sliderSpecs.volume],
      [d.textScale, sliderSpecs.textScale],
      [d.rumbleIntensity, sliderSpecs.rumbleIntensity],
      [d.touchScale, sliderSpecs.touchScale],
      [d.touchOpacity, sliderSpecs.touchOpacity],
    ] as const;
    for (const [value, spec] of checks) {
      expect(value).toBeGreaterThanOrEqual(spec.min);
      expect(value).toBeLessThanOrEqual(spec.max);
    }
    expect(d.quality).toBeNull();
    expect(d.leftHanded).toBe(false);
  });
});

describe('controls help', () => {
  test('keyboard rows come from the real bindings', () => {
    const rows = controlRows('keyboard');
    expect(rows[0]?.options).toEqual([
      ['W', 'A', 'S', 'D'],
      ['↑', '←', '↓', '→'],
    ]);
    expect(rows.find((r) => r.action === 'interact')?.options).toEqual([['E']]);
    expect(rows.find((r) => r.action === 'ping')?.options).toEqual([['Q']]);
  });

  test('gamepad uses the face buttons of the standard mapping', () => {
    const rows = controlRows('gamepad');
    expect(rows.find((r) => r.action === 'interact')?.options).toEqual([['A']]);
    expect(rows.find((r) => r.action === 'work')?.options).toEqual([['X']]);
    expect(rows.find((r) => r.action === 'ping')?.options).toEqual([['Y']]);
  });

  test('every device lists every action', () => {
    for (const device of ['keyboard', 'gamepad', 'touch'] as const) {
      expect(controlRows(device).map((r) => r.action)).toEqual([
        'move',
        'interact',
        'work',
        'ping',
      ]);
    }
  });

  test('key labels', () => {
    expect(keyLabel('KeyE')).toBe('E');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Space')).toBe('Spacja');
  });
});

describe('misc', () => {
  test('tabs wrap around', () => {
    expect(nextTab('controls', 1)).toBe('sound');
    expect(nextTab('sound', -1)).toBe('controls');
  });

  test('quality note exists for every choice', () => {
    for (const q of [null, 'low', 'medium', 'high'] as const) {
      expect(qualityNote(q).length).toBeGreaterThan(5);
    }
  });
});
