import { describe, expect, it } from 'bun:test';
import {
  BAG_PREVIEW_SEED,
  DIFFICULTIES,
  MULTI_STAMP_EXTRA_DEADLINE_MS,
  parseLayout,
  type StationKind,
} from '@redakcja/shared';
import {
  bagSlotTimes,
  decidingStations,
  generateBagLevel,
  isPinned,
  pinnedCounts,
  starThresholds,
} from './bag.ts';
import { checkBag, checkLayout, maxLevelScore, validateContent } from './checks.ts';
import { LEVEL_FILES, STORY_FILES } from './files.ts';
import { getLevel, STORIES } from './index.ts';
import { levelFileSchema, type Story } from './schema.ts';

// S7-57: level 5 moves to a 24×14 room with Stenogram and Metadane, every l5 story gets a stamp
// for both, and four stories are retargeted to them.
// S7-59: seven new stories, each pinned to one station, for the S7-60 bag pool.
const PINNED: readonly [string, StationKind][] = [
  ['l5-cytat-z-sesji', 'transcript'],
  ['l5-wywiad-skrocony', 'transcript'],
  ['l5-zdjecie-czytelnika', 'metadata'],
  ['l5-film-z-montazu', 'metadata'],
  ['l5-drzemka-na-sesji', 'metadata'],
  ['l5-burmistrz-morsuje', 'archive'],
  ['l5-falszywy-profil-urzedu', 'sourceRegistry'],
];
// S7-60: the eighth new story, pinned to the Lupa obrazu.
const PINNED_S7_60: readonly [string, StationKind][] = [['l5-basen-zamkniety', 'imageSearch']];
const NEW_IDS = new Set([...PINNED, ...PINNED_S7_60].map(([id]) => id));
const level = getLevel('l5-deepfake');
const stations = level?.stations ?? [];
const l5Stories = STORIES.filter((story) => story.id.startsWith('l5-'));

function story(id: string): Story {
  const found = l5Stories.find((s) => s.id === id);
  if (!found) {
    throw new Error(`${id} missing`);
  }
  return found;
}

function stampOf(s: Story, station: StationKind) {
  return s.stamps.find((stamp) => stamp.station === station);
}

describe('l5 Głęboka podróbka room (S7-57)', () => {
  it('is a 24×14 room with seven stations, Stenogram and Metadane included', () => {
    const map = parseLayout(level?.layout ?? []);
    expect({ width: map.width, height: map.height }).toEqual({ width: 24, height: 14 });
    expect(stations).toEqual([
      'imageSearch',
      'aiScanner',
      'sourceRegistry',
      'phone',
      'archive',
      'transcript',
      'metadata',
    ]);
    const placed = map.fixtures
      .filter((f) => f.kind === 'station')
      .map((f) => [f.station, f.col, f.row]);
    expect(placed).toEqual([
      ['imageSearch', 9, 1],
      ['aiScanner', 12, 1],
      ['sourceRegistry', 15, 1],
      ['transcript', 18, 1],
      ['archive', 4, 10],
      ['phone', 11, 10],
      ['metadata', 18, 10],
    ]);
    expect(map.fixtures.filter((f) => f.kind === 'conveyor')).toHaveLength(5);
    expect(map.fixtures.filter((f) => f.kind === 'desk')).toHaveLength(2);
    expect(map.fixtures.filter((f) => f.kind === 'table')).toHaveLength(4);
    expect(map.spawns).toHaveLength(4);
  });

  it('passes sign spacing and reachability', () => {
    const found: string[] = [];
    checkLayout(level?.layout ?? [], (_path, severity, message) =>
      found.push(`${severity}: ${message}`),
    );
    expect(found).toEqual([]);
  });

  it('names the new stations in the briefing', () => {
    expect(level?.briefingPoints).toEqual([
      'Skaner AI: tylko podpowiedź, może się mylić.',
      'Stenogram: czy cięcie zmienia sens?',
      'Metadane: kiedy i czym zrobiono plik.',
    ]);
  });

  it('validates the level and its stories without errors or other warnings', () => {
    const issues = validateContent(
      [{ file: 'levels/l5-deepfake.json', data: LEVEL_FILES['levels/l5-deepfake.json'] }],
      [{ file: 'stories/l5-deepfake.json', data: STORY_FILES['stories/l5-deepfake.json'] }],
    );
    // Endless deck warnings depend on the whole campaign, not on this level. Since S7-60 every
    // l5 story is in the bag pool or an event, so none is left unscheduled.
    expect(
      issues
        .filter((issue) => issue.file !== 'endless')
        .map((issue) => `${issue.severity}: ${issue.message}`),
    ).toEqual([]);
  });
});

describe('l5 Stenogram and Metadane stamps (S7-57)', () => {
  it('covers all 25 l5 stories, each with one stamp per level station', () => {
    expect(l5Stories).toHaveLength(25);
    for (const s of l5Stories) {
      expect({ id: s.id, stations: s.stamps.map((stamp) => stamp.station).sort() }).toEqual({
        id: s.id,
        stations: [...stations].sort(),
      });
      expect(stampOf(s, 'transcript')?.id).toBe(`${s.id}-transcript`);
      expect(stampOf(s, 'metadata')?.id).toBe(`${s.id}-metadata`);
      expect(s.reviewed).toBe(false);
    }
  });

  it('retargets four stories to the new stations', () => {
    const deciding = (id: string) => decidingStations(story(id), stations);
    expect(deciding('l5-wyciety-cytat')).toEqual(['transcript']);
    expect(stampOf(story('l5-wyciety-cytat'), 'archive')?.relevance).toBe('irrelevant');
    expect(deciding('l5-wywiad-radio')).toEqual(['phone', 'transcript']);
    expect(deciding('l5-burmistrz-na-jachcie')).toEqual(['sourceRegistry', 'metadata']);
    expect(deciding('l5-zdjecie-sprzed-lat')).toEqual(['imageSearch', 'archive', 'metadata']);
    for (const id of ['l5-wyciety-cytat', 'l5-wywiad-radio', 'l5-zdjecie-sprzed-lat']) {
      expect(story(id).requiredStamps).toBe(1);
    }
    // S7-60 makes the yacht photo a two-proof pick (registry + Metadane).
    expect(story('l5-burmistrz-na-jachcie').requiredStamps).toBe(2);
    expect(story('l5-wyciety-cytat').debrief.tool.startsWith('Stenogram:')).toBe(true);
    expect(story('l5-wywiad-radio').debrief.tool).toContain('Stenogram');
    expect(story('l5-burmistrz-na-jachcie').debrief.tool).toContain('Metadane');
    expect(story('l5-zdjecie-sprzed-lat').debrief.tool).toContain('Metadane');
  });

  it('keeps every other story deciding where it did before', () => {
    const retargeted = new Set([
      'l5-wyciety-cytat',
      'l5-wywiad-radio',
      'l5-burmistrz-na-jachcie',
      'l5-zdjecie-sprzed-lat',
    ]);
    for (const s of l5Stories) {
      if (retargeted.has(s.id) || NEW_IDS.has(s.id)) {
        continue;
      }
      const deciding = decidingStations(s, stations);
      expect({ id: s.id, transcript: deciding.includes('transcript') }).toEqual({
        id: s.id,
        transcript: false,
      });
      expect({ id: s.id, metadata: deciding.includes('metadata') }).toEqual({
        id: s.id,
        metadata: false,
      });
    }
  });

  it('follows the station authoring rules', () => {
    for (const s of l5Stories) {
      const transcript = stampOf(s, 'transcript');
      const metadata = stampOf(s, 'metadata');
      // A decisive Stenogram or Metadane stamp is always a proof.
      for (const stamp of [transcript, metadata]) {
        if (stamp?.relevance === 'decisive') {
          expect(s.justifyingStamps).toContain(stamp.id);
        }
      }
      // Stenogram decides only quotes and recordings.
      if (transcript?.relevance === 'decisive') {
        expect(['quote', 'recording']).toContain(s.type);
      }
      // An irrelevant Metadane stamp means the metadata was stripped, and says so.
      if (metadata?.relevance === 'irrelevant') {
        expect({ id: s.id, text: metadata.text }).toEqual({
          id: s.id,
          text: expect.stringMatching(/usun\S+ metadane .+ nic z nich nie wynika\.$/),
        });
      }
    }
  });
});

// The bag pool: every l5 story that no level event spawns.
const eventIds = new Set(
  (level?.events ?? []).flatMap((event) => (event.kind === 'outage' ? [] : [event.storyId])),
);
const pool = l5Stories.filter((s) => !eventIds.has(s.id));

function expectPinned(id: string, station: StationKind): void {
  const s = story(id);
  expect(s.reviewed).toBe(false);
  expect(s.requiredStamps).toBe(1);
  expect(s.stamps.map((stamp) => stamp.station)).toEqual(stations);
  expect(decidingStations(s, stations)).toEqual([station]);
  expect(isPinned(s, stations)).toBe(true);
  // Only the proof looks decisive, so no other station promises more than it gives.
  expect(s.stamps.filter((stamp) => stamp.relevance === 'decisive').map((x) => x.station)).toEqual([
    station,
  ]);
}

describe('l5 new stories (S7-59)', () => {
  for (const [id, station] of PINNED) {
    it(`pins ${id} to ${station}`, () => expectPinned(id, station));
  }

  it('follows the cluster C table: types, truths and techniques', () => {
    expect(
      PINNED.map(([id]) => {
        const s = story(id);
        return [id, s.type, s.truth, s.priority, s.technique];
      }),
    ).toEqual([
      ['l5-cytat-z-sesji', 'quote', 'false', 'important', 'zmyslony-cytat'],
      ['l5-wywiad-skrocony', 'recording', 'misleading', 'important', 'tania-podrobka-wyciecie'],
      ['l5-zdjecie-czytelnika', 'photo', 'true', 'important', 'none'],
      ['l5-film-z-montazu', 'recording', 'false', 'urgent', 'deepfake-wideo'],
      ['l5-drzemka-na-sesji', 'photo', 'misleading', 'normal', 'zdjecie-w-zlym-czasie'],
      ['l5-burmistrz-morsuje', 'recording', 'true', 'normal', 'none'],
      ['l5-falszywy-profil-urzedu', 'post', 'false', 'urgent', 'podszywanie-sie-pod-instytucje'],
    ]);
    // The deepfake's AI scanner stamp misleads: the Metadane are the proof.
    expect(stampOf(story('l5-film-z-montazu'), 'aiScanner')?.relevance).toBe('misleading');
  });

  it('keeps about a third of the new stories true', () => {
    expect(PINNED.filter(([id]) => story(id).truth === 'true')).toHaveLength(2);
  });
});

describe('l5 on the bag with two-proof picks (S7-60)', () => {
  const file = levelFileSchema.parse(LEVEL_FILES['levels/l5-deepfake.json']);
  const bag = file.bag;
  if (!bag) {
    throw new Error('l5 has no bag');
  }
  const byId = new Map(STORIES.map((s) => [s.id, s]));

  for (const [id, station] of PINNED_S7_60) {
    it(`pins ${id} to ${station}`, () => expectPinned(id, station));
  }

  it('adds a doctored photo the AI scanner calls authentic', () => {
    const s = story('l5-basen-zamkniety');
    expect([s.type, s.truth, s.priority, s.technique]).toEqual([
      'photo',
      'false',
      'important',
      'zmanipulowane-zdjecie',
    ]);
    expect(stampOf(s, 'aiScanner')?.relevance).toBe('misleading');
    expect(stampOf(s, 'metadata')?.relevance).toBe('irrelevant');
    expect(s.debrief.tool.startsWith('Lupa obrazu:')).toBe(true);
  });

  it('deals the level from a bag of the 23 non-event l5 stories, 7 of them true', () => {
    expect(bag).toMatchObject({
      firstAtS: 4,
      gapS: 26,
      lastSpawnS: 340,
      deadlineS: { normal: 60, important: 60, urgent: 45 },
    });
    expect(bag.starShares).toBeUndefined();
    expect(file.schedule).toBeUndefined();
    expect(file.stars).toBeUndefined();
    expect([...bag.pool].sort()).toEqual(pool.map((s) => s.id).sort());
    expect(pool).toHaveLength(23);
    expect(pool.filter((s) => s.truth === 'true')).toHaveLength(7);
    // The events stay: two boss calls and the AI scanner outage.
    expect(file.events).toEqual([
      { kind: 'bossCall', atS: 90, storyId: 'l5-boss-obwodnica', deadlineS: 45 },
      { kind: 'outage', atS: 170, station: 'aiScanner', durationS: 20 },
      { kind: 'bossCall', atS: 250, storyId: 'l5-boss-dymisja', deadlineS: 45 },
    ]);
  });

  it('pins at least 3 pool stories on each of the six bag stations', () => {
    expect(Object.fromEntries(pinnedCounts(pool, stations))).toEqual({
      imageSearch: 3,
      sourceRegistry: 3,
      phone: 4,
      archive: 3,
      transcript: 3,
      metadata: 3,
    });
  });

  it('asks two proofs on wolne-tempo and burmistrz-na-jachcie, never on the AI scanner', () => {
    const tempo = story('l5-wolne-tempo');
    expect(tempo.requiredStamps).toBe(2);
    expect(decidingStations(tempo, stations)).toEqual(['imageSearch', 'archive']);
    const yacht = story('l5-burmistrz-na-jachcie');
    expect(yacht.requiredStamps).toBe(2);
    expect(decidingStations(yacht, stations)).toEqual(['sourceRegistry', 'metadata']);
    expect(isPinned(tempo, stations)).toBe(false);
    expect(isPinned(yacht, stations)).toBe(false);
    // Its second justifying stamp is the hint-only AI scanner, so it stays a one-proof story.
    expect(story('l5-nagranie-podatek').requiredStamps).toBe(1);
    expect(pool.filter((s) => s.requiredStamps > 1).map((s) => s.id)).toEqual([
      'l5-wolne-tempo',
      'l5-burmistrz-na-jachcie',
    ]);
  });

  it('serves the Normal preview run: 13 folders from 4 s, every 26 s, stars 230 / 330', () => {
    expect(level).toEqual(generateBagLevel(file, STORIES, BAG_PREVIEW_SEED, 'normal'));
    expect(level?.schedule.map((spawn) => spawn.atS)).toEqual([
      4, 30, 56, 82, 108, 134, 160, 186, 212, 238, 264, 290, 316,
    ]);
    expect(new Set(level?.schedule.map((spawn) => spawn.storyId)).size).toBe(13);
    expect(level?.stars).toEqual({ two: 230, three: 330 });
    expect(level ? maxLevelScore(level, byId) : 0).toBe(415);
  });

  it('passes the bag checks with no issue: 11, 13, 15 and 17 folders by difficulty', () => {
    expect(DIFFICULTIES.map((d) => bagSlotTimes(bag, d).length)).toEqual([11, 13, 15, 17]);
    const issues: string[] = [];
    checkBag({ ...file, bag }, byId, (path, severity, message) =>
      issues.push(`${severity} ${path.join('.')}: ${message}`),
    );
    expect(issues).toEqual([]);
  });

  it('ends every dealt folder with the level and takes the stars from the default shares', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 7, 0xffffffff]) {
        const dealt = generateBagLevel(file, STORIES, seed, difficulty);
        const ids = dealt.schedule.map((spawn) => spawn.storyId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => bag.pool.includes(id))).toBe(true);
        for (const spawn of dealt.schedule) {
          const extraProofs = (byId.get(spawn.storyId)?.requiredStamps ?? 1) - 1;
          const extraS = (extraProofs * MULTI_STAMP_EXTRA_DEADLINE_MS) / 1000;
          expect(spawn.atS + spawn.deadlineS + extraS).toBeLessThanOrEqual(file.durationS);
        }
        expect(dealt.stars).toEqual(starThresholds(maxLevelScore(dealt, byId)));
      }
    }
  });
});
