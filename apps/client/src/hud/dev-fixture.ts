// Dev-only HUD fixture (vite dev server + ?debug): `window.__hud` fills the game store with a
// believable mid-level state and plays verdict events, so the HUD and the results page can be
// reviewed before the gameplay units spawn real folders. Never installed in production builds.
import type { Folder, FolderResult, GameEvent, LevelEndMessage } from '@redakcja/shared';
import { type GameplayEvent, handleGameEvent } from '../net/game-events.ts';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { registerHudStory } from './story-lookup.ts';

type VerdictEvent = Extract<GameEvent, { kind: 'verdictResult' }>;

export type HudDevApi = {
  /** Loads folders, score, credibility and timers; snapshots then only advance the clock. */
  play(options?: { timeLeftMs?: number; score?: number; credibility?: number }): void;
  set(patch: { score?: number; credibility?: number; timeLeftMs?: number }): void;
  verdict(patch?: Partial<VerdictEvent>): void;
  expire(storyId?: string): void;
  end(won: boolean, stars: number): void;
  /** Gives the store back to the server's snapshots. */
  release(): void;
};

const FIXTURE_ELAPSED_MS = 120_000;
const URGENT_STORY = 'l0-dev-pilny-komunikat';

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
    folder('f-3', 'l0-nocny-autobus', { kind: 'fixture', fixtureId: 'archive-0' }, 48_000, [
      'l0-nocny-autobus-source',
      'l0-nocny-autobus-archive',
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
    verdict: FolderResult['verdict'],
    scoreDelta: number,
    credibilityDelta: number,
  ): FolderResult => ({
    folderId,
    storyId,
    outcome,
    verdict,
    scoreDelta,
    credibilityDelta,
    missedStampIds: [],
  });
  return [
    result('f-1', 'l0-zalany-rynek', 'correct', 'reject', 25, 5),
    result('f-2', 'l0-nocny-autobus', 'correct', 'publish', 15, 0),
    result('f-3', URGENT_STORY, 'wrong', 'publish', -20, -25),
    result('f-4', 'l0-nocny-autobus', 'wrongJustification', 'publish', 5, 0),
    result('f-5', 'l0-zalany-rynek', 'expired', null, -5, -5),
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
        folders: fixtureFolders(useApp.getState().playerId ?? 'p-dev'),
        levelEnd: null,
      });
    },
    set(patch) {
      useGame.setState(patch);
    },
    verdict(patch = {}) {
      const event: VerdictEvent = {
        kind: 'verdictResult',
        folderId: `dev-${serial++}`,
        storyId: 'l0-zalany-rynek',
        playerId: useApp.getState().playerId ?? 'p-dev',
        verdict: 'reject',
        justifyingStampId: 'l0-zalany-rynek-image',
        outcome: 'correct',
        scoreDelta: 25,
        credibilityDelta: 5,
        speedBonus: true,
        missedStampIds: [],
        ...patch,
      };
      handleGameEvent(event satisfies GameplayEvent);
    },
    expire(storyId = 'l0-nocny-autobus') {
      handleGameEvent({ kind: 'folderExpired', folderId: `dev-${serial++}`, storyId });
    },
    end(won, stars) {
      const state = useGame.getState();
      const message: LevelEndMessage = {
        type: 'levelEnd',
        levelId: 'l0-greybox',
        won,
        stars,
        score: state.score,
        credibility: state.credibility,
        results: fixtureResults(),
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
