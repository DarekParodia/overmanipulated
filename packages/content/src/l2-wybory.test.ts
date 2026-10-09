import { describe, expect, it } from 'bun:test';
import { addPlayer, createGameState, parseLayout, step, TICK_MS } from '@redakcja/shared';
import { maxStoryScore } from './checks.ts';
import { getLevel, storiesForLevel } from './index.ts';

const level = getLevel('l2-wybory');
if (!level) {
  throw new Error('level l2-wybory is not registered');
}
const stories = storiesForLevel(level);
const map = parseLayout(level.layout);
const ctx = { dtMs: TICK_MS, map, level, stories };

describe('level 2 — Wybory samorządowe', () => {
  it('is registered with the Archiwum and the three-station layout', () => {
    expect(level.stations).toEqual(['imageSearch', 'archive', 'sourceRegistry']);
    expect(map.spawns).toHaveLength(4);
    expect(level.events).toEqual([]);
  });

  it('uses publishWithContext for at least a quarter of its stories', () => {
    const scheduled = level.schedule.map((s) => stories[s.storyId]);
    const withContext = scheduled.filter((s) => s?.correctVerdict === 'publishWithContext');
    expect(withContext.length / scheduled.length).toBeGreaterThanOrEqual(0.25);
  });

  it('can be solved: every story spawns and its justifying stamp earns the full score', () => {
    level.schedule.forEach((spawn, index) => {
      const story = stories[spawn.storyId];
      const stampId = story?.justifyingStamps[0];
      if (!story || !stampId) {
        throw new Error(`story ${spawn.storyId} is unsolvable`);
      }
      let state = addPlayer(createGameState({ map, seed: 3 }), 'p1', { x: 2.5, y: 2.5 });
      // Jump to the tick right before this story's spawn.
      state = { ...state, nextSpawnIndex: index, elapsedMs: spawn.atS * 1000 - TICK_MS };
      state = step(state, {}, [], ctx).state;
      const folder = Object.values(state.folders).find((f) => f.storyId === story.id);
      if (!folder) {
        throw new Error(`story ${story.id} did not spawn`);
      }
      // The team has collected the decisive stamp; the folder is on the desk.
      const deskId = map.fixtures.find((f) => f.kind === 'desk')?.id ?? '';
      state = {
        ...state,
        folders: {
          ...state.folders,
          [folder.id]: {
            ...folder,
            stamps: [stampId],
            location: { kind: 'fixture', fixtureId: deskId },
          },
        },
        desks: { ...state.desks, [deskId]: { id: deskId, operatorId: 'p1' } },
      };
      const result = step(
        state,
        {},
        [
          {
            playerId: 'p1',
            command: {
              kind: 'verdict',
              folderId: folder.id,
              verdict: story.correctVerdict,
              justifyingStampId: stampId,
            },
          },
        ],
        ctx,
      );
      expect(result.state.results[0]).toMatchObject({ storyId: story.id, outcome: 'correct' });
      expect(result.state.score).toBe(maxStoryScore(story));
    });
  });
});
