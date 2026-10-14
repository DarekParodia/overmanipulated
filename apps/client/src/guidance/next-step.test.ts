// Role ability hints in the "what next" bubble (S7-45): a ready ability that helps right now
// takes the hint, worded with the device's key.
import { describe, expect, test } from 'bun:test';
import { type AbilityPreview, type Folder, parseLayout } from '@redakcja/shared';
import {
  abilityHintKey,
  HERE_KINDS,
  type NextStepAbility,
  type NextStepInput,
  nextStep,
  type StoryStamps,
} from './next-step.ts';
import { placementFor } from './placement.ts';
import { effectiveHints } from './store.ts';

const ME = 'p1';
const map = parseLayout([
  '#########',
  '#CC.AP.R#',
  '#.......#',
  '#.T..DD.#',
  '#1......#',
  '#########',
]);

const story: StoryStamps = {
  stamps: [
    { id: 's-archive', station: 'archive' },
    { id: 's-phone', station: 'phone' },
    { id: 's-registry', station: 'sourceRegistry' },
  ],
  justifyingStamps: ['s-phone', 's-registry'],
};

function folder(location: Folder['location'], extra: Partial<Folder> = {}): Folder {
  return {
    id: 'f',
    spawnKey: 's0',
    storyId: 'story',
    location,
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
    ...extra,
  };
}

const carried = { kind: 'carried', playerId: ME } as const;
const idle = (id: string) => ({ id, operatorId: null, phase: 'idle' });

function input(partial: Partial<NextStepInput>): NextStepInput {
  return {
    playerId: ME,
    folders: [],
    stations: [idle('archive-0'), idle('phone-0'), idle('sourceRegistry-0')],
    desks: [
      { id: 'desk-0', operatorId: null },
      { id: 'desk-1', operatorId: null },
    ],
    map,
    targetFixtureId: null,
    device: 'keyboard',
    story: (id) => (id === 'story' ? story : undefined),
    next: { kind: 'none' },
    ...partial,
  };
}

function ability(
  name: NextStepAbility['ability'],
  preview: AbilityPreview,
  key = 'R',
): NextStepAbility {
  return { ability: name, preview, key };
}

describe('abilityHintKey', () => {
  test('R on the keyboard, RB on a pad, the thumb button label on touch', () => {
    expect(abilityHintKey('keyboard', 'extendDeadline')).toBe('R');
    expect(abilityHintKey('gamepad', 'fieldCall')).toBe('RB');
    expect(abilityHintKey('touch', 'fieldCall')).toBe('„Dzwoń”');
    expect(abilityHintKey('touch', 'extendDeadline')).toBe('„+20 s”');
  });
});

describe('Przedłużenie: an editor carrying a warned folder', () => {
  const warned = folder(carried, { warned: true });
  const now = ability('extendDeadline', { kind: 'now', folderId: 'f' });

  test('a ready press: the hint names the key and the 20 seconds', () => {
    expect(nextStep(input({ folders: [warned], ability: now }))).toEqual({
      kind: 'ability',
      text: 'R: +20 s dla teczki',
      targetFixtureIds: [],
      ability: 'extendDeadline',
    });
    const pad = ability('extendDeadline', { kind: 'now', folderId: 'f' }, 'RB');
    expect(nextStep(input({ folders: [warned], ability: pad })).text).toBe('RB: +20 s dla teczki');
  });

  test('beats the walk to the desk with a proven folder', () => {
    const proven = folder(carried, { warned: true, stamps: ['s-phone'] });
    expect(nextStep(input({ folders: [proven], ability: now })).kind).toBe('ability');
  });

  test('no hint for a folder that is not warned, while cooling, or for another target', () => {
    expect(nextStep(input({ folders: [folder(carried)], ability: now })).kind).toBe('toStation');
    const cooling = ability('extendDeadline', { kind: 'cooling', readyAtMs: 9000 });
    expect(nextStep(input({ folders: [warned], ability: cooling })).kind).toBe('toStation');
    const other = ability('extendDeadline', { kind: 'now', folderId: 'other' });
    expect(nextStep(input({ folders: [warned], ability: other })).kind).toBe('toStation');
  });

  test('no hint without a role', () => {
    expect(nextStep(input({ folders: [warned] })).kind).toBe('toStation');
  });
});

describe('Telefon z terenu: a reporter heading for the phone', () => {
  const now = ability('fieldCall', { kind: 'now', folderId: 'f' });

  test('carrying a folder the phone would prove: call from the field', () => {
    expect(nextStep(input({ folders: [folder(carried)], ability: now }))).toEqual({
      kind: 'ability',
      text: 'R: zadzwoń z terenu',
      targetFixtureIds: [],
      ability: 'fieldCall',
    });
    const touch = ability('fieldCall', { kind: 'now', folderId: 'f' }, '„Dzwoń”');
    expect(nextStep(input({ folders: [folder(carried)], ability: touch })).text).toBe(
      '„Dzwoń”: zadzwoń z terenu',
    );
  });

  test('the phone is not on the way: the usual walk', () => {
    const elsewhere = input({
      folders: [folder(carried)],
      ability: now,
      story: () => ({ ...story, justifyingStamps: ['s-registry'] }),
    });
    expect(nextStep(elsewhere)).toMatchObject({ kind: 'toStation', text: 'Zanieś do: Kartoteka' });
  });

  test('facing the free phone already: put the folder down', () => {
    const step = nextStep(
      input({ folders: [folder(carried)], ability: now, targetFixtureId: 'phone-0' }),
    );
    expect(step.kind).toBe('dropHere');
  });

  test('blocked or calling already: no hint', () => {
    const blocked = ability('fieldCall', { kind: 'blocked', reason: 'noStamp' });
    expect(nextStep(input({ folders: [folder(carried)], ability: blocked })).kind).toBe(
      'toStation',
    );
    const calling = ability('fieldCall', { kind: 'calling', folderId: 'f', endsAtMs: 6000 });
    expect(nextStep(input({ folders: [folder(carried)], ability: calling })).kind).toBe(
      'toStation',
    );
  });
});

describe('Druga szansa: a generalist at a locked station', () => {
  const locked = [
    { id: 'archive-0', operatorId: null, phase: 'lockout' },
    idle('phone-0'),
    idle('sourceRegistry-0'),
  ];
  const onArchive = folder({ kind: 'fixture', fixtureId: 'archive-0' });

  test('facing the locked station a press reopens: the hint rings it', () => {
    const now = ability('secondChance', {
      kind: 'now',
      stationId: 'archive-0',
      folderId: 'f',
    });
    const step = nextStep(
      input({
        folders: [onArchive],
        stations: locked,
        targetFixtureId: 'archive-0',
        ability: now,
      }),
    );
    expect(step).toEqual({
      kind: 'ability',
      text: 'R: druga szansa',
      targetFixtureIds: ['archive-0'],
      ability: 'secondChance',
    });
    expect(HERE_KINDS.has(step.kind)).toBe(true);
    expect(placementFor(step.kind)).toBe('prompt');
  });

  test('armed, or reopening another station: the plain lockout hint', () => {
    const arm = ability('secondChance', { kind: 'arm' });
    const base = { folders: [onArchive], stations: locked, targetFixtureId: 'archive-0' };
    expect(nextStep(input({ ...base, ability: arm }))).toMatchObject({
      kind: 'lockout',
      text: 'Weź teczkę gdzie indziej',
    });
    const other = ability('secondChance', { kind: 'now', stationId: 'phone-0', folderId: 'g' });
    expect(nextStep(input({ ...base, ability: other })).kind).toBe('lockout');
  });

  test('another ability at the locked station: the plain lockout hint', () => {
    const extend = ability('extendDeadline', { kind: 'now', folderId: 'f' });
    expect(
      nextStep(
        input({
          folders: [onArchive],
          stations: locked,
          targetFixtureId: 'archive-0',
          ability: extend,
        }),
      ).kind,
    ).toBe('lockout');
  });
});

describe('Ekspert', () => {
  test('the effective hints are off, so the bubble with the ability hint hides', () => {
    expect(effectiveHints(true, 'expert')).toBe(false);
    expect(effectiveHints(true, 'hard')).toBe(true);
  });
});
