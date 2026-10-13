// S7-07 'done when': a campaign level played by the real simulation, and its Kolegium. One card
// per folder, so the card points add up to the level-end score; the folder still in play at the
// end is listed (last), and only the folders that did not end `correct` show the deciding proof.
import { describe, expect, test } from 'bun:test';
import { getStory, LEVELS, storiesForLevel } from '@redakcja/content';
import {
  addPlayer,
  countsAsProof,
  createGameState,
  type GameState,
  NORMAL_TUNING,
  parseLayout,
  requiredStampsOf,
  step,
  TICK_MS,
  VERDICTS,
  type Verdict,
} from '@redakcja/shared';
import { kolegiumCards } from './results-model.ts';

const LEVEL_S = 20;

function playLevel() {
  const level = LEVELS[0];
  if (!level) {
    throw new Error('no campaign level');
  }
  const book = storiesForLevel(level);
  const stories = Object.values(book)
    .filter((story) => story.stamps.some((stamp) => !story.justifyingStamps.includes(stamp.id)))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 5);
  expect(stories).toHaveLength(5);
  const [right, wrong, weak, late, open] = stories;
  if (!right || !wrong || !weak || !late || !open) {
    throw new Error('not enough stories');
  }
  const map = parseLayout(level.layout);
  // Five folders a second apart; the fourth is due almost at once, the rest outlive the level.
  const schedule = stories.map((story, i) => ({
    atS: 1 + i,
    storyId: story.id,
    deadlineS: story === late ? 2 : 60,
  }));
  const ctx = {
    dtMs: TICK_MS,
    map,
    level: { ...level, durationS: LEVEL_S, schedule, events: [] },
    stories: book,
    tuning: NORMAL_TUNING,
  };
  const deskId = map.fixtures.find((f) => f.kind === 'desk')?.id;
  const spawnAt = map.spawns[0];
  if (!deskId || !spawnAt) {
    throw new Error(`${level.id} has no desk or spawn point`);
  }
  let state: GameState = addPlayer(createGameState({ map, seed: 7 }), 'p1', spawnAt);
  const tickUntil = (ms: number) => {
    while (state.elapsedMs < ms && !state.ended) {
      state = step(state, {}, [], ctx).state;
    }
  };
  /** Puts the story's folder on the desk with `stamps` collected and gives the verdict. */
  const decide = (storyId: string, stamps: string[], verdict: Verdict, cited: string[]) => {
    const folder = Object.values(state.folders).find((f) => f.storyId === storyId);
    if (!folder) {
      throw new Error(`${storyId} did not spawn`);
    }
    state = {
      ...state,
      folders: {
        ...state.folders,
        [folder.id]: { ...folder, stamps, location: { kind: 'fixture', fixtureId: deskId } },
      },
      desks: { ...state.desks, [deskId]: { id: deskId, operatorId: 'p1' } },
    };
    const command = {
      playerId: 'p1',
      command: {
        kind: 'verdict' as const,
        folderId: folder.id,
        verdict,
        justifyingStampIds: cited,
      },
    };
    state = step(state, {}, [command], ctx).state;
  };
  tickUntil(6000);
  const proofs = right.justifyingStamps
    .filter((id) => countsAsProof(right, id))
    .slice(0, requiredStampsOf(right));
  decide(right.id, right.justifyingStamps, right.correctVerdict, proofs);
  const wrongVerdict = VERDICTS.find((v) => v !== wrong.correctVerdict) ?? 'publish';
  decide(wrong.id, [], wrongVerdict, [wrong.stamps[0]?.id ?? '']);
  const decoy = weak.stamps.find((stamp) => !weak.justifyingStamps.includes(stamp.id))?.id ?? '';
  decide(weak.id, [decoy], weak.correctVerdict, [decoy]);
  tickUntil(LEVEL_S * 1000 + TICK_MS);
  return { state, stations: level.stations, ids: { right, wrong, weak, late, open } };
}

describe('the Kolegium of a played campaign level', () => {
  const { state, stations, ids } = playLevel();
  const cards = kolegiumCards(state.results, getStory, 'folder', stations);

  test('the level ended with a result for every folder', () => {
    expect(state.ended).not.toBeNull();
    expect(state.results.map((r) => [r.storyId, r.outcome])).toEqual([
      [ids.late.id, 'expired'],
      [ids.right.id, 'correct'],
      [ids.wrong.id, 'wrong'],
      [ids.weak.id, 'wrongJustification'],
      [ids.open.id, 'unfinished'],
    ]);
  });

  test('the card points add up to the level-end score, one card per folder', () => {
    expect(cards).toHaveLength(5);
    const sum = cards.reduce((total, card) => total + card.scoreDelta, 0);
    expect(sum).toBe(state.score);
    expect(state.score).not.toBe(0);
  });

  test('cards come in arrival order with the unfinished folder last', () => {
    expect(cards.map((card) => [card.storyId, card.outcome])).toEqual([
      [ids.right.id, 'correct'],
      [ids.wrong.id, 'wrong'],
      [ids.weak.id, 'wrongJustification'],
      [ids.late.id, 'expired'],
      [ids.open.id, 'unfinished'],
    ]);
  });

  test('only the folders that did not end correct show the deciding proof', () => {
    expect(cards.map((card) => card.proof === null)).toEqual([true, false, false, false, false]);
    // The wrong verdict collected nothing: every deciding proof the level can give is unchecked.
    expect(
      cards[1]?.proof?.every((row) => row.status === 'missing' || row.status === 'cited'),
    ).toBe(true);
    expect(cards[1]?.proof?.length).toBeGreaterThan(0);
  });
});
