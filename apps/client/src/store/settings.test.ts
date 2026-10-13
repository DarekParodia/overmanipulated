import { describe, expect, it } from 'bun:test';
import { defaultSettings, loadSettings } from './settings.ts';

describe('voice volume setting (Lektor)', () => {
  it('defaults to 0.9', () => {
    expect(defaultSettings().voiceVolume).toBe(0.9);
    expect(loadSettings(null).voiceVolume).toBe(0.9);
  });

  it('fills in 0.9 for settings saved before the voice bus existed', () => {
    const saved = JSON.stringify({ masterVolume: 0.5, musicVolume: 0.2, muted: true });
    const settings = loadSettings(saved);
    expect(settings.voiceVolume).toBe(0.9);
    expect(settings.masterVolume).toBe(0.5);
    expect(settings.musicVolume).toBe(0.2);
    expect(settings.muted).toBe(true);
  });

  it('falls back to 0.9 for an invalid value and keeps the other settings', () => {
    for (const voiceVolume of [1.5, -0.1, '0.4', null]) {
      const settings = loadSettings(JSON.stringify({ voiceVolume, sfxVolume: 0.3 }));
      expect(settings.voiceVolume).toBe(0.9);
      expect(settings.sfxVolume).toBe(0.3);
    }
  });

  it('keeps a valid stored value', () => {
    expect(loadSettings(JSON.stringify({ voiceVolume: 0.35 })).voiceVolume).toBe(0.35);
    expect(loadSettings(JSON.stringify({ voiceVolume: 0 })).voiceVolume).toBe(0);
  });
});
