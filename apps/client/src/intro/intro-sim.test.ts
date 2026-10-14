import { describe, expect, it } from 'bun:test';
import { getStory } from '@redakcja/content';
import { TICK_MS } from '@redakcja/shared';
import { fallbackMs } from './intro-model.ts';
import { INTRO_CLIPS, INTRO_SCENES, type IntroTrackId } from './intro-script.ts';
import {
  createIntroRun,
  INTRO_MAP,
  INTRO_PLAYER_ID,
  INTRO_PROOF_STAMP_ID,
  INTRO_STORY_IDS,
  INTRO_TRACK_ORDER,
  introSnapshot,
  introTrackLengthMs,
  introTrackStart,
  runIntroTrack,
} from './intro-sim.ts';

/** The scene's shortest fallback time over the device variants of its line. */
function shortestScene(track: IntroTrackId): number {
  const scene = INTRO_SCENES.find((s) => s.stage.kind === 'engine' && s.stage.track === track);
  const times = INTRO_CLIPS.filter((clip) => clip.scene === scene?.id).map((clip) =>
    fallbackMs(clip.subtitle),
  );
  return Math.min(...times);
}

const where = (track: IntroTrackId, ms: number) =>
  Object.fromEntries(
    Object.values(runIntroTrack(track, ms).state.folders).map((f) => [f.id, f.location]),
  );

describe('intro mini layout', () => {
  it('has a three-tile conveyor, Lupa, Archiwum and one desk', () => {
    expect(INTRO_MAP.fixtures.map((f) => f.id)).toEqual([
      'conveyor-0',
      'conveyor-1',
      'conveyor-2',
      'imageSearch-0',
      'archive-0',
      'desk-0',
    ]);
  });

  it('plays training stories that exist in the content', () => {
    for (const id of Object.values(INTRO_STORY_IDS)) {
      expect(getStory(id)?.id).toBe(id);
    }
    expect(getStory(INTRO_STORY_IDS.photo)?.justifyingStamps).toContain(INTRO_PROOF_STAMP_ID);
  });
});

describe('intro tracks', () => {
  it('follow the scene order of the script', () => {
    const engine = INTRO_SCENES.flatMap((scene) =>
      scene.stage.kind === 'engine' ? [scene.stage.track] : [],
    );
    expect(engine).toEqual([...INTRO_TRACK_ORDER]);
  });

  it('finish their script within the shortest fallback time of their scene', () => {
    expect(INTRO_TRACK_ORDER.map((track) => introTrackLengthMs(track))).toEqual([
      6050, 2000, 3400, 5000, 3400,
    ]);
    expect(INTRO_TRACK_ORDER.map((track) => shortestScene(track))).toEqual([
      7600, 4400, 4400, 8000, 6400,
    ]);
    for (const track of INTRO_TRACK_ORDER) {
      expect(introTrackLengthMs(track)).toBeLessThanOrEqual(shortestScene(track));
    }
  });

  it('folders: three folders ride in and the next one is announced', () => {
    const end = runIntroTrack('conveyorArrivals', shortestScene('conveyorArrivals'));
    expect(where('conveyorArrivals', 7600)).toEqual({
      f1: { kind: 'fixture', fixtureId: 'conveyor-0' },
      f2: { kind: 'fixture', fixtureId: 'conveyor-1' },
      f3: { kind: 'fixture', fixtureId: 'conveyor-2' },
    });
    expect(end.events.map((e) => e.kind)).toEqual([
      'folderSpawned',
      'folderSpawned',
      'folderSpawned',
    ]);
    expect(introSnapshot(end.state).nextFolder).toEqual({ atMs: 60_000, sinceMs: 5500 });
  });

  it('pickup: the reporter picks the photo up from the conveyor', () => {
    expect(where('pickUpFolder', 4400).f1).toEqual({ kind: 'carried', playerId: INTRO_PLAYER_ID });
    // Halfway through the walk the folder still lies on the belt.
    expect(where('pickUpFolder', 500).f1).toEqual({ kind: 'fixture', fixtureId: 'conveyor-0' });
  });

  it('work: the photo goes onto Lupa and the hold opens the minigame', () => {
    const end = runIntroTrack('holdWork', 4400);
    expect(end.state.folders.f1?.location).toEqual({ kind: 'fixture', fixtureId: 'imageSearch-0' });
    expect(end.state.stations['imageSearch-0']).toMatchObject({
      operatorId: INTRO_PLAYER_ID,
      phase: 'minigame',
      // A photo editor works Lupa 40 % faster: 4000 ms × 0.6.
      durationMs: 2400,
    });
    expect(end.events.map((e) => e.kind)).toEqual([
      'folderPutDown',
      'workStarted',
      'minigameStarted',
    ]);
  });

  it('stations: the solved round stamps the photo, the reporter takes it', () => {
    const end = runIntroTrack('earnStamp', 8000);
    expect(end.state.folders.f1?.stamps).toEqual([INTRO_PROOF_STAMP_ID]);
    expect(end.state.folders.f1?.location).toEqual({ kind: 'carried', playerId: INTRO_PLAYER_ID });
    // The stamp lands with the second sentence, not before.
    expect(runIntroTrack('earnStamp', 3900).state.folders.f1?.stamps).toEqual([]);
  });

  it('desk: the stamp is cited and Publikuj is right', () => {
    const end = runIntroTrack('citeAndVerdict', 6400);
    const verdict = end.events.find((e) => e.kind === 'verdictResult');
    expect(verdict).toMatchObject({
      folderId: 'f1',
      verdict: 'publish',
      outcome: 'correct',
      justifyingStampIds: [INTRO_PROOF_STAMP_ID],
    });
    expect(end.state.folders.f1).toBeUndefined();
    expect(end.state.score).toBe(15);
    expect(end.state.results).toHaveLength(1);
    // Before the verdict the sheet is open on the folder.
    const open = runIntroTrack('citeAndVerdict', 2000).state;
    expect(open.desks['desk-0']?.operatorId).toBe(INTRO_PLAYER_ID);
    expect(open.folders.f1?.location).toEqual({ kind: 'fixture', fixtureId: 'desk-0' });
  });

  it('start where the previous script ends', () => {
    expect(introTrackStart('conveyorArrivals').elapsedMs).toBe(0);
    expect(introTrackStart('pickUpFolder').elapsedMs).toBe(6050);
    expect(introTrackStart('citeAndVerdict').elapsedMs).toBe(6050 + 2000 + 3400 + 5000);
    const before = runIntroTrack('earnStamp', introTrackLengthMs('earnStamp')).state;
    expect(introTrackStart('citeAndVerdict')).toEqual(before);
  });

  it('are deterministic: the same scene time gives the same state', () => {
    const a = runIntroTrack('holdWork', 2600).state;
    const b = createIntroRun('holdWork');
    for (let i = 0; i < 2600 / TICK_MS; i++) {
      b.advance();
    }
    expect(b.state).toEqual(a);
    expect(b.tick).toBe(52);
  });

  it('keep stepping idle after the script, so the scene can outlast it', () => {
    const late = runIntroTrack('pickUpFolder', 12_000).state;
    expect(late.folders.f1?.location).toEqual({ kind: 'carried', playerId: INTRO_PLAYER_ID });
    expect(late.players[INTRO_PLAYER_ID]?.moving).toBe(false);
  });
});
