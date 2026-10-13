import { describe, expect, it } from 'bun:test';
import { parseLayout, type StationKind } from '@redakcja/shared';
import { decidingStations } from './bag.ts';
import { checkLayout, validateContent } from './checks.ts';
import { LEVEL_FILES, STORY_FILES } from './files.ts';
import { getLevel, STORIES } from './index.ts';
import type { Story } from './schema.ts';

// S7-57: level 5 moves to a 24×14 room with Stenogram and Metadane, every l5 story gets a stamp
// for both, and four stories are retargeted to them.
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

  it('validates the level and its stories without errors or warnings', () => {
    const issues = validateContent(
      [{ file: 'levels/l5-deepfake.json', data: LEVEL_FILES['levels/l5-deepfake.json'] }],
      [{ file: 'stories/l5-deepfake.json', data: STORY_FILES['stories/l5-deepfake.json'] }],
    );
    // Endless deck warnings depend on the whole campaign, not on this level.
    expect(issues.filter((issue) => issue.file !== 'endless')).toEqual([]);
  });
});

describe('l5 Stenogram and Metadane stamps (S7-57)', () => {
  it('covers all 17 l5 stories, each with one stamp per level station', () => {
    expect(l5Stories).toHaveLength(17);
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
    for (const id of [
      'l5-wyciety-cytat',
      'l5-wywiad-radio',
      'l5-burmistrz-na-jachcie',
      'l5-zdjecie-sprzed-lat',
    ]) {
      expect(story(id).requiredStamps).toBe(1);
    }
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
      if (retargeted.has(s.id)) {
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
