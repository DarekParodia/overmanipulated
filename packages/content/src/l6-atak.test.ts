import { describe, expect, it } from 'bun:test';
import { CONTENT_TRUE_STORY_SHARE, parseLayout, type StationKind } from '@redakcja/shared';
import { decidingStations, isPinned } from './bag.ts';
import { getLevel, STORIES } from './index.ts';
import type { Story } from './schema.ts';

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
  it('gives each of the 29 stories, event stories included, one stamp per station', () => {
    expect(l6Stories).toHaveLength(29);
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

  it('brings the l6 true share to 9 of 29', () => {
    expect(l6Stories.filter((story) => story.truth === 'true')).toHaveLength(9);
  });
});
