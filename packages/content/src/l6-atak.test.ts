import { describe, expect, it } from 'bun:test';
import {
  BAG_PREVIEW_SEED,
  CONTENT_TRUE_STORY_SHARE,
  DIFFICULTIES,
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
import { checkBag, maxLevelScore } from './checks.ts';
import { LEVEL_FILES } from './files.ts';
import { getLevel, getStory, STORIES } from './index.ts';
import { levelFileSchema, type Story } from './schema.ts';

// S7-58: l6 Atak grows to 24x14 with Mapa (geolocation) and Inne media (crossCheck).
const level = getLevel('l6-atak');
const stations = level?.stations ?? [];
const l6Stories = STORIES.filter((story) => story.id.startsWith('l6-'));

function l6Story(id: string): Story {
  const story = STORIES.find((candidate) => candidate.id === id);
  if (!story) {
    throw new Error(`${id} missing`);
  }
  return story;
}

describe('l6 Atak room', () => {
  it('plays on eight stations, Mapa and Inne media included', () => {
    expect(stations).toEqual([
      'imageSearch',
      'archive',
      'sourceRegistry',
      'phone',
      'aiScanner',
      'dataLibrary',
      'geolocation',
      'crossCheck',
    ]);
  });

  it('is a 24x14 room: I A R P on the back row, S L G X on the front row', () => {
    const map = parseLayout(level?.layout ?? []);
    expect([map.width, map.height]).toEqual([24, 14]);
    const row = (r: number) =>
      map.fixtures.filter((f) => f.kind === 'station' && f.row === r).map((f) => f.id);
    expect(row(1)).toEqual(['imageSearch-0', 'archive-0', 'sourceRegistry-0', 'phone-0']);
    expect(row(10)).toEqual(['aiScanner-0', 'dataLibrary-0', 'geolocation-0', 'crossCheck-0']);
    expect(map.spawns).toHaveLength(4);
  });

  it('fits every bot raid on the belt', () => {
    const belt = parseLayout(level?.layout ?? []).fixtures.filter((f) => f.kind === 'conveyor');
    expect(belt).toHaveLength(5);
    const raids = (level?.events ?? []).flatMap((event) =>
      event.kind === 'botRaid' ? [event.count] : [],
    );
    expect(raids).toEqual([4, 5]);
  });
});

describe('l6 Atak stamps', () => {
  it('gives each of the 33 stories, event stories included, one stamp per station', () => {
    expect(l6Stories).toHaveLength(33);
    for (const story of l6Stories) {
      expect(story.stamps.map((stamp) => stamp.station)).toEqual(stations);
      expect(story.stamps.slice(6).map((stamp) => stamp.id)).toEqual([
        `${story.id}-map`,
        `${story.id}-media`,
      ]);
      expect(story.reviewed).toBe(false);
    }
  });

  it('lists every decisive stamp as justifying', () => {
    for (const story of l6Stories) {
      const decisive = story.stamps.filter((stamp) => stamp.relevance === 'decisive');
      expect(decisive.map((stamp) => stamp.id).sort()).toEqual([...story.justifyingStamps].sort());
    }
  });

  it('lets Mapa decide only photos', () => {
    const mapDecides = l6Stories.filter((story) =>
      decidingStations(story, ['geolocation']).includes('geolocation'),
    );
    expect(mapDecides.map((story) => story.id)).toEqual([
      'l6-fotka-urny',
      'l6-most-zamkniety',
      'l6-kolejka-do-lokalu',
      'l6-pusta-dwunastka',
    ]);
    expect(mapDecides.every((story) => story.type === 'photo')).toBe(true);
  });

  it('demotes a second proof so each story is pinned to one station', () => {
    const pinned: readonly [string, StationKind][] = [
      ['l6-nagranie-zastepcy', 'archive'],
      ['l6-wyrwany-cytat-radnej', 'archive'],
      ['l6-dowoz-seniorow', 'phone'],
      ['l6-frekwencja-w-poludnie', 'sourceRegistry'],
    ];
    for (const [id, station] of pinned) {
      const story = l6Story(id);
      expect(decidingStations(story, stations)).toEqual([station]);
      expect(isPinned(story, stations)).toBe(true);
    }
  });

  it('adds Mapa or Inne media as a proof to four stories', () => {
    expect(decidingStations(l6Story('l6-fotka-urny'), stations)).toEqual([
      'imageSearch',
      'sourceRegistry',
      'geolocation',
    ]);
    expect(decidingStations(l6Story('l6-referendum-w-poniedzialek'), stations)).toEqual([
      'archive',
      'sourceRegistry',
      'crossCheck',
    ]);
    expect(decidingStations(l6Story('l6-anonimowa-komisja'), stations)).toEqual([
      'sourceRegistry',
      'crossCheck',
    ]);
    expect(decidingStations(l6Story('l6-autobusy-w-niedziele'), stations)).toEqual([
      'sourceRegistry',
      'phone',
      'crossCheck',
    ]);
  });

  it('readies the multi-stamp picks: hashtag gets a third proof, apel keeps two', () => {
    expect(decidingStations(l6Story('l6-hashtag-12-to-koniec'), stations)).toEqual([
      'archive',
      'dataLibrary',
      'crossCheck',
    ]);
    expect(decidingStations(l6Story('l6-apel-mieszkancow'), stations)).toEqual([
      'archive',
      'phone',
    ]);
  });
});

/** The l6 stories with exactly one deciding station, that station being `station`. */
function pinnedTo(station: StationKind): string[] {
  return l6Stories
    .filter((story) => isPinned(story, stations))
    .filter((story) => decidingStations(story, stations)[0] === station)
    .map((story) => story.id);
}

// S7-61: three stories pinned to Mapa and three pinned to Inne media.
describe('l6 Atak stories for Mapa and Inne media', () => {
  it('pins three photos with a place claim to Mapa', () => {
    expect(pinnedTo('geolocation')).toEqual([
      'l6-most-zamkniety',
      'l6-kolejka-do-lokalu',
      'l6-pusta-dwunastka',
    ]);
    expect(['l6-most-zamkniety', 'l6-pusta-dwunastka'].map((id) => l6Story(id).truth)).toEqual([
      'false',
      'false',
    ]);
    expect(l6Story('l6-kolejka-do-lokalu').truth).toBe('true');
  });

  it('files the two photos from elsewhere under the place alias', () => {
    // So a Metadane puzzle on them contradicts on the place, not the date.
    expect(['l6-most-zamkniety', 'l6-pusta-dwunastka'].map((id) => l6Story(id).technique)).toEqual([
      'zdjecie-z-innego-miejsca',
      'zdjecie-z-innego-miejsca',
    ]);
  });

  it('writes irrelevant Mapa stamps as a place that matches its caption', () => {
    // An irrelevant stamp shows no problem, so the minigame shows a photo from the captioned
    // district; the stamp must not claim there is nothing to find on the map.
    const irrelevant = l6Stories.flatMap((story) =>
      story.stamps.filter(
        (stamp) => stamp.station === 'geolocation' && stamp.relevance === 'irrelevant',
      ),
    );
    expect(irrelevant.length).toBeGreaterThan(0);
    for (const stamp of irrelevant) {
      expect({ id: stamp.id, matches: stamp.text.includes('podpisu') }).toEqual({
        id: stamp.id,
        matches: true,
      });
    }
  });

  it('pins three stories to Inne media', () => {
    expect(pinnedTo('crossCheck')).toEqual([
      'l6-agencja-dementuje',
      'l6-relacja-z-debaty',
      'l6-awaria-w-lokalu',
    ]);
    expect(
      ['l6-agencja-dementuje', 'l6-relacja-z-debaty', 'l6-awaria-w-lokalu'].map(
        (id) => l6Story(id).truth,
      ),
    ).toEqual(['false', 'true', 'true']);
  });

  it('keeps the true share of l6 within the content target', () => {
    const trueShare = l6Stories.filter((story) => story.truth === 'true').length / l6Stories.length;
    expect(trueShare).toBeGreaterThanOrEqual(CONTENT_TRUE_STORY_SHARE.min);
    expect(trueShare).toBeLessThanOrEqual(CONTENT_TRUE_STORY_SHARE.max);
  });

  it('writes non-deciding Inne media stamps as no independent coverage', () => {
    const quiet = ['l6-most-zamkniety', 'l6-kolejka-do-lokalu', 'l6-pusta-dwunastka'].map(
      (id) => l6Story(id).stamps.find((stamp) => stamp.station === 'crossCheck')?.text,
    );
    expect(quiet).toEqual([
      'Nikt jeszcze o\u00a0tym nie pisze, temat krąży tylko w\u00a0grupach.',
      'Nikt jeszcze o\u00a0tym nie pisze, to świeże zgłoszenie.',
      'Trzy portale to powtarzają – same kopie wpisu.',
    ]);
  });
});

// S7-62: Lupa and the archive each get three pinned stories.
describe('l6 Atak stories for Lupa and the archive', () => {
  it('pins three photos to Lupa: two old ones and a photomontage', () => {
    expect(pinnedTo('imageSearch')).toEqual([
      'l6-tlum-przed-ratuszem',
      'l6-plakat-sprzed-lat',
      'l6-baner-na-dwunastce',
    ]);
    const plakat = l6Story('l6-plakat-sprzed-lat');
    expect([plakat.type, plakat.truth, plakat.correctVerdict, plakat.technique]).toEqual([
      'photo',
      'misleading',
      'publishWithContext',
      'stare-zdjecie-nowy-podpis',
    ]);
    const baner = l6Story('l6-baner-na-dwunastce');
    expect([baner.type, baner.truth, baner.correctVerdict, baner.technique]).toEqual([
      'photo',
      'false',
      'reject',
      'zmanipulowane-zdjecie',
    ]);
  });

  it('pins three stories to the archive, one of them true', () => {
    expect(pinnedTo('archive')).toEqual([
      'l6-nagranie-zastepcy',
      'l6-wyrwany-cytat-radnej',
      'l6-kronika-dwunastki',
    ]);
    const kronika = l6Story('l6-kronika-dwunastki');
    expect([kronika.truth, kronika.correctVerdict, kronika.technique]).toEqual([
      'true',
      'publish',
      'none',
    ]);
  });

  it('keeps Mapa on the place, not the date, of the two Lupa photos', () => {
    const map = ['l6-plakat-sprzed-lat', 'l6-baner-na-dwunastce'].map((id) =>
      l6Story(id).stamps.find((stamp) => stamp.station === 'geolocation'),
    );
    expect(map.map((stamp) => [stamp?.relevance, stamp?.text])).toEqual([
      ['misleading', 'Plakat wisi na przystanku Rynek. Miejsce się zgadza.'],
      ['misleading', 'Zajezdnia przy ulicy Portowej, miejsce się zgadza.'],
    ]);
  });
});

// S7-63: the phone and the data library get three pinned stories each, three multi-stamp picks
// ask for two or three proofs, and the level deals from a bag.
describe('l6 Atak stories for the phone and the data library', () => {
  it('pins three stories to the phone: two new, one of them true', () => {
    expect(pinnedTo('phone')).toEqual([
      'l6-dowoz-seniorow',
      'l6-komisja-w-bibliotece',
      'l6-strajk-kierowcow',
    ]);
    expect(
      ['l6-komisja-w-bibliotece', 'l6-strajk-kierowcow'].map((id) => {
        const story = l6Story(id);
        return [story.truth, story.correctVerdict, story.technique];
      }),
    ).toEqual([
      ['true', 'publish', 'none'],
      ['false', 'reject', 'plotka-bez-zrodla'],
    ]);
  });

  it('pins three stories to the data library: two new statistics', () => {
    expect(pinnedTo('dataLibrary')).toEqual([
      'l6-sonda-w-grupie',
      'l6-spoznienia-dwunastki',
      'l6-najdrozsza-linia',
    ]);
    expect(
      ['l6-spoznienia-dwunastki', 'l6-najdrozsza-linia'].map((id) => {
        const story = l6Story(id);
        return [story.type, story.truth, story.correctVerdict, story.technique];
      }),
    ).toEqual([
      ['statistic', 'false', 'reject', 'zmanipulowana-statystyka'],
      ['statistic', 'misleading', 'publishWithContext', 'zmanipulowana-statystyka'],
    ]);
  });

  it('asks two proofs on apel and the poll, three on the hashtag', () => {
    const picks = ['l6-apel-mieszkancow', 'l6-sondaz-pracowni', 'l6-hashtag-12-to-koniec'].map(
      (id) => {
        const story = l6Story(id);
        return [story.requiredStamps, decidingStations(story, stations)];
      },
    );
    expect(picks).toEqual([
      [2, ['archive', 'phone']],
      [2, ['sourceRegistry', 'dataLibrary']],
      [3, ['archive', 'dataLibrary', 'crossCheck']],
    ]);
    const multiStamp = l6Stories.filter((story) => story.requiredStamps !== 1);
    expect(multiStamp.map((story) => story.id)).toEqual([
      'l6-apel-mieszkancow',
      'l6-sondaz-pracowni',
      'l6-hashtag-12-to-koniec',
    ]);
  });

  it('brings the l6 true share to 10 of 33', () => {
    expect(l6Stories.filter((story) => story.truth === 'true')).toHaveLength(10);
  });
});

describe('l6 Atak on the bag', () => {
  const file = levelFileSchema.parse(LEVEL_FILES['levels/l6-atak.json']);
  const pool = (file.bag?.pool ?? []).flatMap((id) => {
    const story = getStory(id);
    return story ? [story] : [];
  });

  it('deals from a bag of the 28 l6 stories no event spawns, with no schedule or stars', () => {
    expect(file.bag).toMatchObject({
      firstAtS: 4,
      gapS: 27,
      lastSpawnS: 382,
      deadlineS: { normal: 55, important: 55, urgent: 40 },
    });
    expect(file.bag?.starShares).toBeUndefined();
    expect(file.schedule).toBeUndefined();
    expect(file.stars).toBeUndefined();
    expect(pool).toHaveLength(28);
    expect(new Set(pool.map((story) => story.id)).size).toBe(28);
    const eventStories = file.events.flatMap((event) =>
      event.kind === 'outage' ? [] : [event.storyId],
    );
    expect(eventStories).toEqual([
      'l6-nalot-zostaje12',
      'l6-sprostowanie-apel',
      'l6-szef-kaze-publikowac',
      'l6-nalot-hashtag',
      'l6-sprostowanie-tlum',
    ]);
    expect(
      l6Stories
        .map((story) => story.id)
        .filter((id) => !eventStories.includes(id))
        .sort(),
    ).toEqual(pool.map((story) => story.id).sort());
  });

  it('keeps the events as they were', () => {
    expect(file.events.map((event) => [event.kind, event.atS])).toEqual([
      ['botRaid', 60],
      ['correction', 140],
      ['bossCall', 195],
      ['outage', 230],
      ['botRaid', 285],
      ['correction', 345],
    ]);
  });

  it('keeps the pool true share within the content target: 10 of 28', () => {
    const trueCount = pool.filter((story) => story.truth === 'true').length;
    expect(trueCount).toBe(10);
    expect(trueCount / pool.length).toBeGreaterThanOrEqual(CONTENT_TRUE_STORY_SHARE.min);
    expect(trueCount / pool.length).toBeLessThanOrEqual(CONTENT_TRUE_STORY_SHARE.max);
  });

  it('pins three pool stories on each of the seven bag stations', () => {
    expect(Object.fromEntries(pinnedCounts(pool, stations))).toEqual({
      imageSearch: 3,
      archive: 3,
      sourceRegistry: 3,
      phone: 3,
      dataLibrary: 3,
      geolocation: 3,
      crossCheck: 3,
    });
  });

  it('passes the bag checks with no issue: 12, 15, 16 and 18 folders by difficulty', () => {
    const bag = file.bag;
    if (!bag) {
      throw new Error('l6 has no bag');
    }
    expect(DIFFICULTIES.map((d) => bagSlotTimes(bag, d).length)).toEqual([12, 15, 16, 18]);
    const issues: string[] = [];
    checkBag({ ...file, bag }, new Map(STORIES.map((s) => [s.id, s])), (path, severity, message) =>
      issues.push(`${severity} ${path.join('.')}: ${message}`),
    );
    expect(issues).toEqual([]);
  });

  it('serves the Normal preview run of the bag: 15 folders from 4 s, every 27 s', () => {
    expect(level).toEqual(generateBagLevel(file, STORIES, BAG_PREVIEW_SEED, 'normal'));
    expect(level?.schedule.map((spawn) => spawn.atS)).toEqual([
      4, 31, 58, 85, 112, 139, 166, 193, 220, 247, 274, 301, 328, 355, 382,
    ]);
    expect(new Set(level?.schedule.map((spawn) => spawn.storyId)).size).toBe(15);
  });

  it('ends every dealt folder with the level and takes the stars from the default shares', () => {
    const byId = new Map(STORIES.map((s) => [s.id, s]));
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [0, 1, 7, 0xffffffff]) {
        const dealt = generateBagLevel(file, STORIES, seed, difficulty);
        const ids = dealt.schedule.map((spawn) => spawn.storyId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => id.startsWith('l6-'))).toBe(true);
        for (const spawn of dealt.schedule) {
          expect(spawn.atS + spawn.deadlineS).toBeLessThanOrEqual(file.durationS);
        }
        expect(dealt.stars).toEqual(starThresholds(maxLevelScore(dealt, byId)));
      }
    }
  });
});
