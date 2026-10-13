// Dev-only HUD fixture (vite dev server + ?debug): `window.__hud` fills the game store with a
// believable mid-level state and plays verdict events, so the HUD and the results page can be
// reviewed before the gameplay units spawn real folders. Never installed in production builds.
import type {
  Folder,
  FolderResult,
  GameEvent,
  LevelEndMessage,
  NextFolder,
} from '@redakcja/shared';
import { type GameplayEvent, handleGameEvent } from '../net/game-events.ts';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { registerHudStory } from './story-lookup.ts';

type VerdictEvent = Extract<GameEvent, { kind: 'verdictResult' }>;

export type HudDevApi = {
  /**
   * Loads folders, score, credibility and timers; snapshots then only advance the clock.
   * `folders` keeps only the first N fixture folders (fewer than three leave a slot for the
   * next-folder ghost card).
   */
  play(options?: {
    timeLeftMs?: number;
    score?: number;
    credibility?: number;
    folders?: number;
  }): void;
  set(patch: {
    score?: number;
    credibility?: number;
    timeLeftMs?: number;
    nextFolder?: NextFolder | null;
    conveyorFull?: boolean;
  }): void;
  verdict(patch?: Partial<VerdictEvent>): void;
  expire(storyId?: string): void;
  end(won: boolean, stars: number): void;
  /** Gives the store back to the server's snapshots. */
  release(): void;
};

const FIXTURE_ELAPSED_MS = 120_000;
/** l0's schedule at the fixture time: a folder came at 120 s, the next one comes at 140 s. */
const FIXTURE_NEXT_FOLDER: NextFolder = { atMs: 140_000, sinceMs: 120_000 };
/** The l0 greybox level's star thresholds and best possible score. */
const FIXTURE_STARS = { two: 120, three: 190 };
const FIXTURE_MAX_SCORE = 240;
const URGENT_STORY = 'l0-dev-pilny-komunikat';
/** A multi-stamp story (S7-19) so the folder card's evidence chip shows "1/2". */
const MULTI_STORY = 'l0-dev-dwa-dowody';

function fixtureFolders(playerId: string): Folder[] {
  const at = FIXTURE_ELAPSED_MS;
  const folder = (
    id: string,
    storyId: string,
    location: Folder['location'],
    leftMs: number,
    stamps: string[],
  ): Folder => ({
    id,
    // `f-3` was the schedule's third folder (s2).
    spawnKey: `s${Number(id.slice(2)) - 1}`,
    storyId,
    location,
    stamps,
    spawnedAtMs: at - 20_000,
    deadlineMs: at + leftMs,
    warned: false,
  });
  return [
    folder('f-1', URGENT_STORY, { kind: 'fixture', fixtureId: 'conveyor-0' }, 7_400, []),
    folder('f-2', 'l0-zalany-rynek', { kind: 'carried', playerId }, 21_000, [
      'l0-zalany-rynek-image',
    ]),
    folder('f-3', MULTI_STORY, { kind: 'fixture', fixtureId: 'archive-0' }, 48_000, [
      `${MULTI_STORY}-archive`,
    ]),
    folder('f-4', 'l0-zalany-rynek', { kind: 'fixture', fixtureId: 'desk-0' }, 75_000, [
      'l0-zalany-rynek-image',
      'l0-zalany-rynek-archive',
      'l0-zalany-rynek-source',
    ]),
    folder('f-5', 'l0-nocny-autobus', { kind: 'floor', x: 4, y: 3 }, 110_000, []),
  ];
}

function fixtureResults(): FolderResult[] {
  const result = (
    folderId: string,
    storyId: string,
    outcome: FolderResult['outcome'],
    reason: FolderResult['reason'],
    verdict: FolderResult['verdict'],
    scoreDelta: number,
    credibilityDelta: number,
    speed = 0,
  ): FolderResult => ({
    folderId,
    spawnKey: `s${Number(folderId.slice(2)) - 1}`,
    storyId,
    outcome,
    reason,
    verdict,
    scoreDelta,
    credibilityDelta,
    justifyingStampIds: verdict === null ? [] : [`${storyId}-image`],
    requiredStamps: 1,
    bonuses: { speed, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  });
  // The results design fixture (S7-05): its totals add up to 15 points.
  return [
    result('f-1', 'l0-zalany-rynek', 'correct', 'correctImportant', 'reject', 25, 5, 5),
    result('f-2', 'l0-nocny-autobus', 'correct', 'correctNormal', 'publish', 10, 0),
    result('f-3', URGENT_STORY, 'wrong', 'publishedFake', 'publish', -20, -25),
    result('f-4', 'l0-nocny-autobus', 'wrongJustification', 'weakProof', 'publish', 5, 0),
    result('f-5', 'l0-zalany-rynek', 'expired', 'expired', null, -5, -5),
    result('f-6', 'l0-nocny-autobus', 'unfinished', 'unfinished', null, 0, 0),
  ];
}

export function installHudDevFixture(): (() => void) | undefined {
  if (!import.meta.env.DEV || !new URLSearchParams(window.location.search).has('debug')) {
    return undefined;
  }
  registerHudStory(URGENT_STORY, {
    headline: 'Komunikat o skażonej wodzie w kranach na Zatorzu',
    type: 'post',
    priority: 'urgent',
    truth: 'false',
  });
  registerHudStory(MULTI_STORY, {
    headline: 'Dwa raporty o korkach na moście',
    type: 'article',
    priority: 'important',
    truth: 'false',
    requiredStamps: 2,
    stamps: [
      { id: `${MULTI_STORY}-archive`, station: 'archive', text: 'Raport z 2019 r.' },
      { id: `${MULTI_STORY}-source`, station: 'sourceRegistry', text: 'Konto założone wczoraj' },
    ],
    justifyingStamps: [`${MULTI_STORY}-archive`, `${MULTI_STORY}-source`],
  });
  const original = useGame.getState().applySnapshot;
  let serverElapsed: number | null = null;
  let serial = 0;

  const freeze = () => {
    serverElapsed = null;
    useGame.setState({
      applySnapshot(snapshot) {
        const delta = serverElapsed === null ? 0 : Math.max(0, snapshot.elapsedMs - serverElapsed);
        serverElapsed = snapshot.elapsedMs;
        const state = useGame.getState();
        useGame.setState({
          tick: snapshot.tick,
          elapsedMs: state.elapsedMs + delta,
          timeLeftMs: Math.max(0, state.timeLeftMs - delta),
        });
      },
    });
  };

  const api: HudDevApi = {
    play(options = {}) {
      freeze();
      useGame.setState({
        elapsedMs: FIXTURE_ELAPSED_MS,
        timeLeftMs: options.timeLeftMs ?? 95_000,
        score: options.score ?? 145,
        credibility: options.credibility ?? 70,
        folders: fixtureFolders(useApp.getState().playerId ?? 'p-dev').slice(0, options.folders),
        nextFolder: FIXTURE_NEXT_FOLDER,
        conveyorFull: false,
        levelEnd: null,
      });
    },
    set(patch) {
      useGame.setState(patch);
    },
    verdict(patch = {}) {
      const n = serial++;
      const event: VerdictEvent = {
        kind: 'verdictResult',
        folderId: `dev-${n}`,
        spawnKey: `s${n}`,
        storyId: 'l0-zalany-rynek',
        playerId: useApp.getState().playerId ?? 'p-dev',
        verdict: 'reject',
        outcome: 'correct',
        reason: 'correctImportant',
        scoreDelta: 25,
        credibilityDelta: 5,
        justifyingStampIds: ['l0-zalany-rynek-image'],
        requiredStamps: 1,
        bonuses: { speed: 5, multiStamp: 0, bossCall: 0 },
        missedStampIds: [],
        ...patch,
      };
      handleGameEvent(event satisfies GameplayEvent);
    },
    expire(storyId = 'l0-nocny-autobus') {
      const n = serial++;
      handleGameEvent({
        kind: 'folderExpired',
        folderId: `dev-${n}`,
        spawnKey: `s${n}`,
        storyId,
        stamps: [],
      });
    },
    end(won, stars) {
      const state = useGame.getState();
      const results = fixtureResults();
      const message: LevelEndMessage = {
        type: 'levelEnd',
        levelId: 'l0-greybox',
        difficulty: 'normal',
        won,
        stars,
        // The results' own sum, so the totals need no 'Inne' row.
        score: results.reduce((sum, result) => sum + result.scoreDelta, 0),
        credibility: state.credibility,
        results,
        lossReason: won ? null : state.credibility <= 0 ? 'credibility' : 'score',
        starThresholds: FIXTURE_STARS,
        maxScore: FIXTURE_MAX_SCORE,
      };
      state.setLevelEnd(message);
    },
    release() {
      useGame.setState({ applySnapshot: original });
    },
  };

  const target = window as unknown as { __hud?: HudDevApi };
  target.__hud = api;
  return () => {
    api.release();
    delete target.__hud;
  };
}
