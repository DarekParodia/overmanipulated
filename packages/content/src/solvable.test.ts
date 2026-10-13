// Every level can be played to its full score: each story it schedules or spawns from an event
// arrives on the conveyor and earns `maxStoryScore` when the desk cites its required proofs from
// the level's stations (S7-18; replaces the level 2 only l2-wybory.test.ts).
import { describe, expect, it } from 'bun:test';
import {
  addPlayer,
  countsAsProof,
  createGameState,
  ENDLESS_LEVEL_ID,
  MULTI_STAMP_EXTRA_DEADLINE_MS,
  NORMAL_TUNING,
  parseLayout,
  requiredStampsOf,
  SCORE,
  step,
  TICK_MS,
} from '@redakcja/shared';
import { maxStoryScore } from './checks.ts';
import { getLevel, getStory, LEVELS, storiesForLevel } from './index.ts';
import type { Level, Story } from './schema.ts';

/** The campaign levels and the endless preview (its pool is filtered by `isSolvable`). */
function levelsToCheck(): Level[] {
  const endless = getLevel(ENDLESS_LEVEL_ID);
  return endless ? [...LEVELS, endless] : [...LEVELS];
}

/**
 * The time each story of the level gets: its first schedule entry or event, in seconds. A bag
 * level adds every pool story the preview run did not deal, at its Normal priority deadline.
 */
function deadlinesOf(level: Level, stories: Readonly<Record<string, Story>>): Map<string, number> {
  const deadlines = new Map<string, number>();
  for (const entry of [
    ...level.schedule,
    ...level.events.flatMap((e) => (e.kind === 'outage' ? [] : [e])),
  ]) {
    if (!deadlines.has(entry.storyId)) {
      deadlines.set(entry.storyId, entry.deadlineS);
    }
  }
  for (const id of level.bag?.pool ?? []) {
    const priority = stories[id]?.priority ?? 'normal';
    if (level.bag && !deadlines.has(id)) {
      deadlines.set(id, level.bag.deadlineS[priority]);
    }
  }
  return deadlines;
}

/** The level's story book plus every bag pool story (the preview run deals only some of them). */
function storiesToPlay(level: Level): Readonly<Record<string, Story>> {
  const pool = (level.bag?.pool ?? []).flatMap((id) => {
    const story = getStory(id);
    return story ? [[id, story] as const] : [];
  });
  return { ...storiesForLevel(level), ...Object.fromEntries(pool) };
}

/** The first `requiredStamps` proofs the level's stations can give, or fewer when they fall short. */
function proofsFor(story: Story, level: Level): string[] {
  const proofs = story.justifyingStamps.filter((id) => {
    const station = story.stamps.find((stamp) => stamp.id === id)?.station;
    return station !== undefined && level.stations.includes(station) && countsAsProof(story, id);
  });
  return [...new Set(proofs)].slice(0, requiredStampsOf(story));
}

/**
 * Spawns the story alone at 1 s, puts it on the desk with its proofs collected and cites them
 * right away. Returns what went wrong, or an empty list.
 */
function playStory(level: Level, story: Story, deadlineS: number): string[] {
  const map = parseLayout(level.layout);
  const solo = { ...level, schedule: [{ atS: 1, storyId: story.id, deadlineS }], events: [] };
  const ctx = {
    dtMs: TICK_MS,
    map,
    level: solo,
    stories: { ...storiesForLevel(level), [story.id]: story },
    tuning: NORMAL_TUNING,
  };
  const deskId = map.fixtures.find((f) => f.kind === 'desk')?.id;
  const spawnAt = map.spawns[0];
  if (!deskId || !spawnAt) {
    return [`${level.id} has no desk or spawn point`];
  }
  let state = addPlayer(createGameState({ map, seed: 3 }), 'p1', spawnAt);
  state = step({ ...state, elapsedMs: 1000 - TICK_MS }, {}, [], ctx).state;
  const folder = Object.values(state.folders).find((f) => f.storyId === story.id);
  if (!folder) {
    return [`${story.id} did not spawn`];
  }
  const required = requiredStampsOf(story);
  const issues: string[] = [];
  const dueMs =
    1000 + Math.round(deadlineS * 1000) + (required - 1) * MULTI_STAMP_EXTRA_DEADLINE_MS;
  if (folder.deadlineMs !== dueMs) {
    issues.push(`${story.id} is due at ${folder.deadlineMs} ms, expected ${dueMs}`);
  }
  const proofs = proofsFor(story, level);
  state = {
    ...state,
    folders: {
      ...state.folders,
      [folder.id]: { ...folder, stamps: proofs, location: { kind: 'fixture', fixtureId: deskId } },
    },
    desks: { ...state.desks, [deskId]: { id: deskId, operatorId: 'p1' } },
  };
  const verdict = {
    playerId: 'p1',
    command: {
      kind: 'verdict' as const,
      folderId: folder.id,
      verdict: story.correctVerdict,
      justifyingStampIds: proofs,
    },
  };
  const after = step(state, {}, [verdict], ctx).state;
  const result = after.results[0];
  if (result?.outcome !== 'correct') {
    issues.push(`${story.id} citing ${proofs.join(', ')} gave ${result?.reason ?? 'no result'}`);
  } else if (result.bonuses.multiStamp !== (required - 1) * SCORE.multiStampBonus) {
    issues.push(`${story.id} got a multi-stamp bonus of ${result.bonuses.multiStamp}`);
  }
  if (after.score !== maxStoryScore(story)) {
    issues.push(`${story.id} scored ${after.score}, max is ${maxStoryScore(story)}`);
  }
  return issues;
}

describe('every level is solvable', () => {
  for (const level of levelsToCheck()) {
    it(`${level.id}: each story earns its maximum score with its required proofs`, () => {
      const stories = storiesToPlay(level);
      const deadlines = deadlinesOf(level, stories);
      expect(deadlines.size).toBeGreaterThan(0);
      const issues = [...deadlines].flatMap(([id, deadlineS]) => {
        const story = stories[id];
        return story ? playStory(level, story, deadlineS) : [`${id} is not in the story book`];
      });
      expect(issues).toEqual([]);
    });
  }

  it('plays the whole l4 bag pool, the two-proof stories included (S7-33)', () => {
    const level = getLevel('l4-zdrowie');
    if (!level) {
      throw new Error('l4-zdrowie missing');
    }
    const deadlines = deadlinesOf(level, storiesToPlay(level));
    expect(deadlines.size).toBe(24);
    expect(deadlines.get('l4-raport-pielegniarek')).toBe(55);
    expect(deadlines.get('l4-cytat-dyrektorki')).toBe(55);
    for (const id of ['l4-raport-pielegniarek', 'l4-cytat-dyrektorki']) {
      const story = getStory(id);
      expect(story?.requiredStamps).toBe(2);
      expect(story ? playStory(level, story, 55) : ['missing']).toEqual([]);
    }
  });

  it('covers a multi-stamp story: two proofs, 20 s more, and the bonus on top', () => {
    const level = LEVELS.find((l) => l.id === 'l0-greybox');
    const flood = level ? storiesForLevel(level)['l0-zalany-rynek'] : undefined;
    if (!level || !flood) {
      throw new Error('greybox level or l0-zalany-rynek missing');
    }
    const twoProofs: Story = { ...flood, requiredStamps: 2 };
    expect(proofsFor(twoProofs, level)).toEqual([
      'l0-zalany-rynek-image',
      'l0-zalany-rynek-archive',
    ]);
    expect(maxStoryScore(twoProofs)).toBe(45);
    expect(playStory(level, twoProofs, 90)).toEqual([]);
  });
});
