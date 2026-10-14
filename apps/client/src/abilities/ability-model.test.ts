import { describe, expect, it } from 'bun:test';
import {
  abilityAriaLabel,
  abilityChipModel,
  abilityPressOutcome,
  abilityTargetFolder,
  abilityTargetName,
} from './ability-model.ts';

describe('ability chip model (S7-40)', () => {
  it('counts a cooldown down in whole seconds and fills the ring', () => {
    const model = abilityChipModel(
      { kind: 'cooling', readyAtMs: 40_000 },
      'extendDeadline',
      17_000,
    );
    expect(model).toMatchObject({
      state: 'cooling',
      seconds: 23,
      label: 'Odnowienie',
      target: null,
    });
    expect(model?.ring).toBeCloseTo(0.617, 3);
  });

  it('runs a field call down over its call time', () => {
    const model = abilityChipModel(
      { kind: 'calling', folderId: 'f1', endsAtMs: 10_000 },
      'fieldCall',
      7000,
    );
    expect(model).toMatchObject({ state: 'calling', seconds: 3, ring: 0.5, label: 'Dzwonię…' });
    expect(model?.target).toEqual({ folderId: 'f1' });
  });

  it('reads now and arm as ready with a full ring', () => {
    expect(abilityChipModel({ kind: 'now', folderId: 'f2' }, 'extendDeadline', 5000)).toEqual({
      ability: 'extendDeadline',
      state: 'ready',
      ring: 1,
      seconds: null,
      label: 'Gotowa',
      target: { folderId: 'f2' },
    });
    expect(abilityChipModel({ kind: 'arm' }, 'expertise', 5000)).toMatchObject({
      state: 'ready',
      ring: 1,
      target: null,
    });
  });

  it('says why a press is blocked, and shows armed', () => {
    expect(
      abilityChipModel({ kind: 'blocked', reason: 'noTarget' }, 'passFolder', 0),
    ).toMatchObject({ state: 'blocked', ring: 0, label: 'Nikt wolny', reason: 'noTarget' });
    expect(abilityChipModel({ kind: 'armed' }, 'secondChance', 0)).toMatchObject({
      state: 'armed',
      ring: 1,
      label: 'Uzbrojona',
    });
  });

  it('shows nothing without an ability', () => {
    expect(abilityChipModel({ kind: 'none' }, 'expertise', 0)).toBeNull();
    expect(abilityChipModel({ kind: 'arm' }, null, 0)).toBeNull();
  });

  it('outlines the folder only while a ready press would act on it', () => {
    const ready = abilityChipModel({ kind: 'now', folderId: 'f3' }, 'extendDeadline', 0);
    const calling = abilityChipModel(
      { kind: 'calling', folderId: 'f3', endsAtMs: 9000 },
      'fieldCall',
      0,
    );
    expect(abilityTargetFolder(ready)).toBe('f3');
    expect(abilityTargetFolder(calling)).toBeNull();
    expect(abilityTargetFolder(null)).toBeNull();
  });
});

describe('ability target name (S7-40)', () => {
  const names = {
    player: (id: string) => (id === 'p2' ? 'Bartek' : undefined),
    station: (id: string) => (id === 'archive-0' ? 'Archiwum' : undefined),
  };

  it('names the receiver of Podaj teczkę and the station of Ekspertyza', () => {
    const pass = abilityChipModel(
      { kind: 'now', folderId: 'f1', targetPlayerId: 'p2' },
      'passFolder',
      0,
    );
    const expert = abilityChipModel(
      { kind: 'now', folderId: 'f1', stationId: 'archive-0' },
      'expertise',
      0,
    );
    expect(abilityTargetName(pass, names)).toBe('Bartek');
    expect(abilityTargetName(expert, names)).toBe('Archiwum');
  });

  it('names nothing for a folder-only target or a state that is not ready', () => {
    const extend = abilityChipModel({ kind: 'now', folderId: 'f1' }, 'extendDeadline', 0);
    const armed = abilityChipModel({ kind: 'armed' }, 'expertise', 0);
    expect(abilityTargetName(extend, names)).toBeNull();
    expect(abilityTargetName(armed, names)).toBeNull();
  });
});

describe('ability accessible name (S7-40)', () => {
  it('names the ability and its status, with the seconds while the ring counts down', () => {
    const cooling = abilityChipModel(
      { kind: 'cooling', readyAtMs: 40_000 },
      'extendDeadline',
      17_000,
    );
    const ready = abilityChipModel({ kind: 'arm' }, 'secondChance', 0);
    expect(cooling && abilityAriaLabel(cooling, cooling.label)).toBe(
      'Przedłużenie: Odnowienie, 23\u00a0s',
    );
    expect(ready && abilityAriaLabel(ready, ready.label)).toBe('Druga szansa: Gotowa');
  });
});

describe('ability press outcome (S7-40)', () => {
  it('sends a press that acts, arms or disarms', () => {
    expect(abilityPressOutcome({ kind: 'now', folderId: 'f1' })).toBe('send');
    expect(abilityPressOutcome({ kind: 'arm' })).toBe('send');
    expect(abilityPressOutcome({ kind: 'armed' })).toBe('send');
  });

  it('keeps a press the simulation would ignore on the client', () => {
    expect(abilityPressOutcome({ kind: 'none' })).toBe('denied');
    expect(abilityPressOutcome({ kind: 'cooling', readyAtMs: 70_000 })).toBe('denied');
    expect(abilityPressOutcome({ kind: 'blocked', reason: 'noFolders' })).toBe('denied');
    expect(abilityPressOutcome({ kind: 'calling', folderId: 'f1', endsAtMs: 33_000 })).toBe(
      'denied',
    );
  });
});
