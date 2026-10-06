// Scoring outside the desk: expiry penalties, credibility bounds, level timer, stars and the
// level end (S2-08). Reads this tick's events (e.g. folderExpired) from `frame.events`.
import { CREDIBILITY, CREDIBILITY_MAX, SCORE } from '../constants.ts';
import { expiryIsPenalized } from '../domain.ts';
import type { FolderResult, LevelOutcome } from '../entities.ts';
import type { SimLevel } from './content.ts';
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

/** Credibility after a change, kept within [0, CREDIBILITY_MAX]. */
export function applyCredibility(credibility: number, delta: number): number {
  return Math.min(CREDIBILITY_MAX, Math.max(0, credibility + delta));
}

/**
 * Stars for a finished level: none when lost, otherwise one for surviving with a positive score
 * plus one for each threshold reached (design doc, "Punktacja").
 */
export function starsFor(score: number, won: boolean, stars: SimLevel['stars']): number {
  if (!won) {
    return 0;
  }
  return 1 + (score >= stars.two ? 1 : 0) + (score >= stars.three ? 1 : 0);
}

/** The level outcome if the level is over now, otherwise null. Credibility loss wins ties. */
export function levelOutcome(state: GameState, level: SimLevel): LevelOutcome | null {
  if (state.credibility <= 0) {
    return { won: false, stars: 0 };
  }
  if (state.elapsedMs >= level.durationS * 1000) {
    const won = state.score > 0;
    return { won, stars: starsFor(state.score, won, level.stars) };
  }
  return null;
}

export function stepScoring(state: GameState, frame: SimFrame): GameState {
  let score = state.score;
  let credibility = state.credibility;
  const expired: FolderResult[] = [];
  for (const event of frame.events) {
    if (event.kind !== 'folderExpired') {
      continue;
    }
    const story = frame.ctx.stories[event.storyId];
    const penalized = story ? expiryIsPenalized(story.truth, story.priority) : true;
    const scoreDelta = penalized ? SCORE.expired : 0;
    const credibilityDelta = penalized ? CREDIBILITY.expired : 0;
    score += scoreDelta;
    credibility = applyCredibility(credibility, credibilityDelta);
    expired.push({
      folderId: event.folderId,
      storyId: event.storyId,
      outcome: 'expired',
      verdict: null,
      scoreDelta,
      credibilityDelta,
      missedStampIds: [...(story?.justifyingStamps ?? [])],
    });
  }

  let next = state;
  if (expired.length > 0) {
    next = { ...state, score, credibility, results: [...state.results, ...expired] };
  }
  if (next.ended) {
    return next;
  }
  const ended = levelOutcome(next, frame.ctx.level);
  return ended ? { ...next, ended } : next;
}
