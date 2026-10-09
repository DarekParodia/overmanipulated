import { describe, expect, test } from 'bun:test';
import {
  EVENT_BOSS_URGENT_MS,
  EVENTS,
  type Folder,
  LEVEL_EVENT_KINDS,
  parseLayout,
} from '@redakcja/shared';
import { type Cue, cues } from '../fx/cues.ts';
import { levelEventCue } from '../fx/event-cues.ts';
import { type NextStepInput, nextStep, type StoryStamps } from '../guidance/next-step.ts';
import { stationIndicator } from '../scene/entities.ts';
import { pl } from '../strings/pl.ts';
import {
  bannerForLevelEvent,
  bossCallSeconds,
  bossCallUrgent,
  correctionStampId,
  formatShares,
  outageFraction,
  outageSeconds,
  pushBanner,
  raidResolvedBanner,
  raidSizes,
  stationIsDown,
  tagBadge,
  viralShares,
} from './event-model.ts';

const name = (id: string | undefined) => (id ? 'Lupa obrazu' : 'Stanowisko');

function folder(id: string, extra: Partial<Folder> = {}): Folder {
  return {
    id,
    storyId: 'story',
    location: { kind: 'fixture', fixtureId: 'conveyor-0' },
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
    ...extra,
  };
}

describe('banners', () => {
  test('every event start has a banner with an icon, a title and a short line', () => {
    for (const event of LEVEL_EVENT_KINDS) {
      const banner = bannerForLevelEvent(
        { event, phase: 'start', stationId: 'imageSearch-0' },
        1,
        name,
      );
      expect(banner).not.toBeNull();
      expect(banner?.title.length).toBeGreaterThan(0);
      // design-rules: at most eight words in total.
      const words = `${banner?.title} ${banner?.line}`.split(/\s+/).filter((w) => w !== '—');
      expect(words.length).toBeLessThanOrEqual(8);
    }
  });

  test('the outage banner names the station, and only outages announce their end', () => {
    const start = bannerForLevelEvent({ event: 'outage', phase: 'start', stationId: 'a' }, 1, name);
    expect(start?.line).toContain('Lupa obrazu');
    const end = bannerForLevelEvent({ event: 'outage', phase: 'end', stationId: 'a' }, 2, name);
    expect(end?.tone).toBe('good');
    for (const event of LEVEL_EVENT_KINDS.filter((e) => e !== 'outage')) {
      expect(bannerForLevelEvent({ event, phase: 'end' }, 3, name)).toBeNull();
    }
    expect(raidResolvedBanner(4).tone).toBe('good');
  });

  test('the stack holds the newest first and at most `max`', () => {
    const a = raidResolvedBanner(1);
    const b = raidResolvedBanner(2);
    const c = raidResolvedBanner(3);
    expect(pushBanner(pushBanner(pushBanner([], a, 2), b, 2), c, 2).map((x) => x.id)).toEqual([
      c.id,
      b.id,
    ]);
  });
});

describe('folder badges', () => {
  test('viral shares follow start * growth ^ age', () => {
    expect(viralShares({ spawnedAtMs: 1000 }, 1000)).toBe(EVENTS.viralSharesStart);
    expect(viralShares({ spawnedAtMs: 0 }, 10_000)).toBe(
      Math.round(EVENTS.viralSharesStart * EVENTS.viralGrowthPerS ** 10),
    );
    // Before the folder existed: no negative age.
    expect(viralShares({ spawnedAtMs: 5000 }, 0)).toBe(EVENTS.viralSharesStart);
    expect(formatShares(214)).toBe('214');
    expect(formatShares(12_400)).toContain('tys.');
  });

  test('the boss call badge counts down and gets urgent near the end', () => {
    const f = folder('f', { tag: { kind: 'bossCall', untilMs: 12_000 } });
    const early = tagBadge(f, 0, () => 1);
    expect(early?.text).toBe('12 s');
    expect(early?.urgent).toBe(false);
    const late = tagBadge(f, 12_000 - EVENT_BOSS_URGENT_MS + 500, () => 1);
    expect(late?.urgent).toBe(true);
    const over = tagBadge(f, 13_000, () => 1);
    expect(over?.text).toBe('');
    expect(over?.label).toBe(pl.events.badge.bossCallOver);
    expect(bossCallSeconds(11_001)).toBe(12);
    expect(bossCallUrgent(0)).toBe(false);
  });

  test('raid and correction badges', () => {
    const a = folder('a', { tag: { kind: 'botRaid', raidId: 'r1' } });
    const b = folder('b', { tag: { kind: 'botRaid', raidId: 'r1' } });
    const other = folder('c', { tag: { kind: 'botRaid', raidId: 'r2' } });
    const sizes = raidSizes([a, b, other, folder('d')]);
    expect(sizes.get('r1')).toBe(2);
    expect(sizes.get('r2')).toBe(1);
    expect(tagBadge(a, 0, (id) => sizes.get(id) ?? 1)?.text).toBe('×2');
    expect(tagBadge(other, 0, (id) => sizes.get(id) ?? 1)?.text).toBe('');
    const fix = folder('x', { tag: { kind: 'correction', recoverCredibility: 10 } });
    expect(tagBadge(fix, 0, () => 1)?.icon).toBe('siren');
    expect(tagBadge(folder('plain'), 0, () => 1)).toBeNull();
  });
});

describe('outage', () => {
  test('a station is down while outageMs is positive', () => {
    expect(stationIsDown({ outageMs: 1 })).toBe(true);
    expect(stationIsDown({ outageMs: 0 })).toBe(false);
    expect(stationIsDown(undefined)).toBe(false);
  });

  test('the ring drains against the announced duration, else the default', () => {
    expect(outageFraction(10_000, 20_000)).toBe(0.5);
    expect(outageFraction(EVENTS.outageDefaultMs / 2, undefined)).toBe(0.5);
    // More time left than announced (a longer outage): the ring stays full.
    expect(outageFraction(30_000, 20_000)).toBe(1);
    expect(outageSeconds(1)).toBe(1);
    expect(outageSeconds(0)).toBe(0);
  });

  test('the station sign shows a down countdown before anything else', () => {
    const indicator = stationIndicator(
      {
        id: 'imageSearch-0',
        kind: 'imageSearch',
        operatorId: null,
        phase: 'idle',
        progressMs: 0,
        durationMs: 4000,
        minigameSeed: 1,
        lockoutMs: 0,
        outageMs: 5000,
      },
      20_000,
    );
    expect(indicator).toEqual({ kind: 'down', fraction: 0.25, seconds: 5 });
  });
});

describe('correction sheet', () => {
  test('files with the first justifying stamp, else the first stamp', () => {
    const story = { justifyingStamps: ['b'], stamps: [{ id: 'a' }, { id: 'b' }] };
    expect(correctionStampId(story, { stamps: [] })).toBe('b');
    expect(correctionStampId({ justifyingStamps: [], stamps: [{ id: 'a' }] }, { stamps: [] })).toBe(
      'a',
    );
    expect(correctionStampId(undefined, { stamps: ['z'] })).toBe('z');
    expect(correctionStampId(undefined, { stamps: [] })).toBeNull();
  });
});

describe('cues', () => {
  test('every event start and end has a cue with a sound and a visual layer', () => {
    for (const event of LEVEL_EVENT_KINDS) {
      for (const phase of ['start', 'end'] as const) {
        const cue: Cue = cues[levelEventCue({ kind: 'levelEvent', event, phase, folderIds: [] })];
        expect(cue.sound).toBeDefined();
        expect(cue.particles !== undefined || cue.animation !== undefined).toBe(true);
      }
    }
  });
});

describe('guidance for tagged folders', () => {
  const map = parseLayout(['########', '#CC.IAR#', '#......#', '#.T..DD#', '#1.....#', '########']);
  const story: StoryStamps = {
    stamps: [
      { id: 's-image', station: 'imageSearch' },
      { id: 's-archive', station: 'archive' },
    ],
    justifyingStamps: ['s-archive'],
  };
  const me = 'p1';
  function input(partial: Partial<NextStepInput>): NextStepInput {
    return {
      playerId: me,
      folders: [],
      stations: [
        { id: 'imageSearch-0', operatorId: null, phase: 'idle' },
        { id: 'archive-0', operatorId: null, phase: 'idle' },
      ],
      desks: [{ id: 'desk-0', operatorId: null }],
      map,
      targetFixtureId: null,
      device: 'keyboard',
      story: (id) => (id === 'story' ? story : undefined),
      ...partial,
    };
  }

  test('the boss call folder on the conveyor says to check first', () => {
    const step = nextStep(
      input({ folders: [folder('f', { tag: { kind: 'bossCall', untilMs: 10_000 } })] }),
    );
    expect(step.kind).toBe('pickup');
    expect(step.text).toBe(pl.events.hint.bossCall);
  });

  test('a carried correction folder goes straight to the desk', () => {
    const step = nextStep(
      input({
        folders: [
          folder('f', {
            location: { kind: 'carried', playerId: me },
            tag: { kind: 'correction', recoverCredibility: 10 },
          }),
        ],
      }),
    );
    expect(step.kind).toBe('toDesk');
  });

  test('a station that is down is not a place to go', () => {
    const carried = folder('f', { location: { kind: 'carried', playerId: me } });
    const step = nextStep(
      input({
        folders: [carried],
        stations: [
          { id: 'imageSearch-0', operatorId: null, phase: 'idle', outageMs: 8000 },
          { id: 'archive-0', operatorId: null, phase: 'idle' },
        ],
      }),
    );
    expect(step.kind).toBe('toStation');
    expect(step.targetFixtureIds).not.toContain('imageSearch-0');
  });
});
