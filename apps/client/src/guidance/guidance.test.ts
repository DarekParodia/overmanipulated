import { describe, expect, test } from 'bun:test';
import { type Desk, type Folder, parseLayout } from '@redakcja/shared';
import type { GameplayEvent } from '../fx/event-cues.ts';
import { pl } from '../strings/pl.ts';
import { type NextStepInput, nextStep, type StoryStamps, sameStep } from './next-step.ts';
import { placementFor } from './placement.ts';
import { advanceTutorial, signalForEvent, TUTORIAL_DONE } from './tutorial.ts';

const map = parseLayout(['########', '#CC.IAR#', '#......#', '#.T..DD#', '#1.....#', '########']);

const story: StoryStamps = {
  stamps: [
    { id: 's-image', station: 'imageSearch' },
    { id: 's-archive', station: 'archive' },
    { id: 's-registry', station: 'sourceRegistry' },
  ],
  justifyingStamps: ['s-archive', 's-registry'],
};

const ME = 'p1';

function folder(id: string, location: Folder['location'], extra: Partial<Folder> = {}): Folder {
  return {
    id,
    storyId: 'story',
    location,
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
    ...extra,
  };
}

const at = (fixtureId: string) => ({ kind: 'fixture', fixtureId }) as const;
const carried = { kind: 'carried', playerId: ME } as const;

type Station = NextStepInput['stations'][number];
const idle = (id: string): Station => ({ id, operatorId: null, phase: 'idle' });

function input(partial: Partial<NextStepInput>): NextStepInput {
  return {
    playerId: ME,
    folders: [],
    stations: [idle('imageSearch-0'), idle('archive-0'), idle('sourceRegistry-0')],
    desks: [
      { id: 'desk-0', operatorId: null },
      { id: 'desk-1', operatorId: null },
    ],
    map,
    targetFixtureId: null,
    device: 'keyboard',
    story: (id) => (id === 'story' ? story : undefined),
    ...partial,
  };
}

describe('nextStep', () => {
  test('nothing anywhere: wait', () => {
    expect(nextStep(input({})).kind).toBe('wait');
  });

  test('a folder dropped on the floor still needs picking up', () => {
    const step = nextStep(input({ folders: [folder('f', { kind: 'floor', x: 3, y: 3 })] }));
    expect(step).toEqual({
      kind: 'pickup',
      text: pl.guidance.hint.pickupWaiting,
      targetFixtureIds: [],
    });
  });

  test('empty hands: the conveyor folder with the earliest deadline', () => {
    const step = nextStep(
      input({
        folders: [
          folder('late', at('conveyor-0'), { deadlineMs: 90_000 }),
          folder('soon', at('conveyor-1'), { deadlineMs: 30_000 }),
        ],
      }),
    );
    expect(step.kind).toBe('pickup');
    expect(step.text).toBe(pl.guidance.hint.pickupConveyor);
    expect(step.targetFixtureIds).toEqual(['conveyor-1']);
  });

  test('empty hands, nothing on the conveyor: a folder left on a table', () => {
    const step = nextStep(input({ folders: [folder('f', at('table-0'))] }));
    expect(step).toEqual({
      kind: 'pickup',
      text: pl.guidance.hint.pickupWaiting,
      targetFixtureIds: ['table-0'],
    });
  });

  test('facing a folder on the conveyor: press interact, worded per device', () => {
    const folders = [folder('f', at('conveyor-0'))];
    expect(nextStep(input({ folders, targetFixtureId: 'conveyor-0' })).text).toBe('Podnieś: E');
    expect(
      nextStep(input({ folders, targetFixtureId: 'conveyor-0', device: 'gamepad' })).text,
    ).toBe('Podnieś: A');
  });

  test('carrying an unchecked folder: only the stations that can justify, by short name', () => {
    const step = nextStep(input({ folders: [folder('f', carried)] }));
    expect(step.kind).toBe('toStation');
    expect(step.targetFixtureIds).toEqual(['archive-0', 'sourceRegistry-0']);
    expect(step.text).toBe('Zanieś do: Archiwum / Kartoteka');
  });

  test('stations with a folder on them are skipped while a free one is left', () => {
    const step = nextStep(
      input({ folders: [folder('f', carried), folder('other', at('archive-0'))] }),
    );
    expect(step.targetFixtureIds).toEqual(['sourceRegistry-0']);
  });

  test('a non-justifying stamp alone is not enough', () => {
    const step = nextStep(input({ folders: [folder('f', carried, { stamps: ['s-image'] })] }));
    expect(step.kind).toBe('toStation');
  });

  test('a story with no justifying station in the level falls back to unchecked ones', () => {
    const only: StoryStamps = {
      stamps: [
        { id: 'x', station: 'imageSearch' },
        { id: 'phone', station: 'phone' },
      ],
      justifyingStamps: ['phone'],
    };
    const step = nextStep(input({ folders: [folder('f', carried)], story: () => only }));
    expect(step.targetFixtureIds).toEqual(['imageSearch-0']);
    expect(step.text).toBe('Zanieś do: Lupa');
  });

  test('facing a useful free station while carrying: put it down', () => {
    const step = nextStep(input({ folders: [folder('f', carried)], targetFixtureId: 'archive-0' }));
    expect(step.kind).toBe('dropHere');
    expect(step.targetFixtureIds).toEqual(['archive-0']);
  });

  test('with a justifying stamp: to a free desk', () => {
    const step = nextStep(
      input({
        folders: [folder('f', carried, { stamps: ['s-archive'] }), folder('o', at('desk-0'))],
      }),
    );
    expect(step.kind).toBe('toDesk');
    expect(step.text).toBe(pl.guidance.hint.toDesk);
    expect(step.targetFixtureIds).toEqual(['desk-1']);
  });

  test('facing a station with an unchecked folder: hold work', () => {
    const step = nextStep(
      input({ folders: [folder('f', at('archive-0'))], targetFixtureId: 'archive-0' }),
    );
    expect(step.kind).toBe('work');
    expect(step.text).toBe('Trzymaj Spację');
    const touch = nextStep(
      input({
        folders: [folder('f', at('archive-0'))],
        targetFixtureId: 'archive-0',
        device: 'touch',
      }),
    );
    expect(touch.text).toBe('Trzymaj „Pracuj”');
  });

  test('a station already stamped for this folder: take the folder', () => {
    const step = nextStep(
      input({
        folders: [folder('f', at('archive-0'), { stamps: ['s-archive'] })],
        targetFixtureId: 'archive-0',
      }),
    );
    expect(step.kind).toBe('pickupHere');
  });

  test('a locked station', () => {
    const step = nextStep(
      input({
        folders: [folder('f', at('archive-0'))],
        stations: [{ id: 'archive-0', operatorId: null, phase: 'lockout' }],
        targetFixtureId: 'archive-0',
      }),
    );
    expect(step.kind).toBe('lockout');
  });

  test('operating a station or a desk', () => {
    const working: Station = { id: 'archive-0', operatorId: ME, phase: 'working' };
    const minigame: Station = { id: 'archive-0', operatorId: ME, phase: 'minigame' };
    const folders = [folder('f', at('archive-0'))];
    expect(nextStep(input({ folders, stations: [working] })).kind).toBe('working');
    expect(nextStep(input({ folders, stations: [minigame] })).kind).toBe('minigame');
    const desks: Desk[] = [{ id: 'desk-0', operatorId: ME }];
    expect(nextStep(input({ folders: [folder('f', at('desk-0'))], desks }))).toEqual({
      kind: 'verdict',
      text: pl.guidance.hint.verdict,
      targetFixtureIds: [],
    });
  });

  test('facing a desk with a folder: hold work to open the sheet', () => {
    const step = nextStep(
      input({ folders: [folder('f', at('desk-0'))], targetFixtureId: 'desk-0' }),
    );
    expect(step.kind).toBe('openDesk');
  });

  test("someone else's station is not offered", () => {
    const step = nextStep(
      input({
        folders: [folder('f', at('archive-0'))],
        stations: [{ id: 'archive-0', operatorId: 'p2', phase: 'working' }],
      }),
    );
    expect(step.kind).toBe('wait');
  });

  test('never names a verdict or the truth', () => {
    const texts = [
      nextStep(input({ folders: [folder('f', carried)] })).text,
      nextStep(input({ folders: [folder('f', carried, { stamps: ['s-archive'] })] })).text,
    ].join(' ');
    for (const word of Object.values(pl.vocab.verdicts)) {
      expect(texts).not.toContain(word);
    }
  });

  test('sameStep compares content', () => {
    const a = nextStep(input({ folders: [folder('f', carried)] }));
    const b = nextStep(input({ folders: [folder('f', carried)] }));
    expect(sameStep(a, b)).toBe(true);
    expect(sameStep(a, null)).toBe(false);
    expect(sameStep(null, null)).toBe(true);
  });
});

describe('placement', () => {
  test('makes room for overlays and the work prompt', () => {
    expect(placementFor('minigame')).toBe('overlay');
    expect(placementFor('verdict')).toBe('overlay');
    expect(placementFor('working')).toBe('prompt');
    expect(placementFor('pickup')).toBe('free');
    expect(placementFor(undefined)).toBe('free');
  });
});

describe('tutorial', () => {
  test('steps advance in order and can be skipped ahead, never back', () => {
    expect(advanceTutorial(0, 'moved')).toBe(1);
    expect(advanceTutorial(1, 'pickedUp')).toBe(2);
    expect(advanceTutorial(1, 'stampApplied')).toBe(4);
    expect(advanceTutorial(3, 'pickedUp')).toBe(3);
    expect(advanceTutorial(4, 'verdict')).toBe(TUTORIAL_DONE);
    expect(advanceTutorial(1, 'teamVerdict')).toBe(1);
    expect(advanceTutorial(4, 'teamVerdict')).toBe(TUTORIAL_DONE);
  });

  test('events count only for the local player, except the verdict', () => {
    const pickup = { kind: 'folderPickedUp', folderId: 'f', playerId: ME } as GameplayEvent;
    expect(signalForEvent(pickup, ME)).toBe('pickedUp');
    expect(signalForEvent(pickup, 'p2')).toBeUndefined();
    const verdict = { kind: 'verdictResult', playerId: 'p2' } as GameplayEvent;
    expect(signalForEvent(verdict, 'p2')).toBe('verdict');
    expect(signalForEvent(verdict, ME)).toBe('teamVerdict');
    const spawned = { kind: 'folderSpawned', folderId: 'f', fixtureId: 'c' } as GameplayEvent;
    expect(signalForEvent(spawned, ME)).toBeUndefined();
  });
});
