import { describe, expect, test } from 'bun:test';
import { cues } from '../fx/cues.ts';
import {
  isSpectatorAudible,
  SPECTATOR_AUDIBLE_CUES,
  SPECTATOR_SFX_GAIN,
  spectatorSoundOutput,
  teamPan,
} from './spectate-audio.ts';

describe('spectator audio policy', () => {
  test('verdict outcomes, expiry, event starts, raids and abilities are heard', () => {
    for (const cue of [
      'verdict.correct',
      'verdict.fakePublished',
      'folder.expired',
      'event.botRaid.start',
      'event.raidResolved',
      'ability.pass',
    ] as const) {
      expect(isSpectatorAudible(cue)).toBe(true);
    }
  });

  test('footsteps, pickups, station work and UI cues stay silent', () => {
    for (const cue of [
      'player.step',
      'folder.pickup',
      'station.workStart',
      'minigame.start',
      'event.end',
      'ability.armed',
      'ui.click',
    ] as const) {
      expect(isSpectatorAudible(cue)).toBe(false);
    }
  });

  test('every audible cue exists and has a sound', () => {
    expect(SPECTATOR_AUDIBLE_CUES.size).toBe(21);
    for (const cue of SPECTATOR_AUDIBLE_CUES) {
      expect('sound' in cues[cue]).toBe(true);
    }
  });

  test('a split pans Kurier left and Głos right; a lone newsroom sits in the centre', () => {
    expect(teamPan(0, true)).toBe(-0.5);
    expect(teamPan(1, true)).toBe(0.5);
    expect(teamPan(1, false)).toBe(0);
  });

  test('the output plays at 0.6 of the volume with the team pan, not the screen pan', () => {
    const calls: unknown[][] = [];
    const output = spectatorSoundOutput((...args) => calls.push(args), -0.5);
    output(['sfx.a'], 'sfx', 0.5, 0.1, 0.9);
    expect(SPECTATOR_SFX_GAIN).toBe(0.6);
    expect(calls).toEqual([[['sfx.a'], 'sfx', 0.3, 0.1, -0.5]]);
  });
});
