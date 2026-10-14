// Scoring outside the desk: expiry penalties, credibility bounds, level timer, stars and the
// level end (S2-08). Reads this tick's events (e.g. folderExpired) from `frame.events`. When the
// level ends, every folder still in play is recorded as `unfinished` (Stage 7). Penalties scale
// with the difficulty through `scalePenalty` (Stage 7).
import { CREDIBILITY, CREDIBILITY_MAX, SCORE } from '../constants.ts';
import { expiryIsPenalized } from '../domain.ts';
import { type Folder, type FolderResult, type LevelOutcome, NO_BONUSES } from '../entities.ts';
import { requiredStampsOf, type SimLevel, type SimStory } from './content.ts';
import { endActiveEvent, raidOfFolder } from './events.ts';
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

/**
 * A penalty scaled by a difficulty factor (`tuning.penaltyFactor`), rounded to a whole number
 * with the halves away from zero: sign × round(|value| × factor), so −25 × 1.5 → −38 and
 * 5 × 1.5 → 8. Rewards are never scaled.
 */
export function scalePenalty(value: number, factor: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * factor);
}

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
    return { won: false, stars: 0, lossReason: 'credibility' };
  }
  if (level.endless) {
    // Endless runs end only when credibility is gone; the score is what counts, not won/stars.
    return null;
  }
  if (state.elapsedMs >= level.durationS * 1000) {
    const won = state.score > 0;
    return {
      won,
      stars: starsFor(state.score, won, level.stars),
      lossReason: won ? null : 'score',
    };
  }
  return null;
}

/** Justifying stamps a folder did not collect. */
function missingProof(story: SimStory | undefined, stamps: readonly string[]): string[] {
  return (story?.justifyingStamps ?? []).filter((id) => !stamps.includes(id));
}

/**
 * One `unfinished` result per folder still in play when the level ends; a botRaid wave counts
 * once (its first folder), as its expiry does.
 */
export function unfinishedResults(
  folders: readonly Folder[],
  stories: Readonly<Record<string, SimStory>>,
): FolderResult[] {
  const countedRaids = new Set<string>();
  const results: FolderResult[] = [];
  for (const folder of folders) {
    if (folder.tag?.kind === 'botRaid') {
      if (countedRaids.has(folder.tag.raidId)) {
        continue;
      }
      countedRaids.add(folder.tag.raidId);
    }
    const story = stories[folder.storyId];
    results.push({
      folderId: folder.id,
      spawnKey: folder.spawnKey,
      storyId: folder.storyId,
      outcome: 'unfinished',
      reason: 'unfinished',
      verdict: null,
      scoreDelta: 0,
      credibilityDelta: 0,
      justifyingStampIds: [],
      requiredStamps: requiredStampsOf(story ?? {}),
      bonuses: NO_BONUSES,
      missedStampIds: missingProof(story, folder.stamps),
    });
  }
  return results;
}

export function stepScoring(state: GameState, frame: SimFrame): GameState {
  let score = state.score;
  let credibility = state.credibility;
  const expired: FolderResult[] = [];
  let next = state;
  const countedRaids = new Set<string>();
  for (const event of [...frame.events]) {
    if (event.kind !== 'folderExpired') {
      continue;
    }
    // A botRaid wave expires as one: the first folder is counted, its siblings are not.
    const raid = raidOfFolder(state, event.folderId);
    if (raid) {
      if (countedRaids.has(raid.raidId ?? '')) {
        continue;
      }
      countedRaids.add(raid.raidId ?? '');
      next = endActiveEvent(next, frame, raid);
    }
    const story = frame.ctx.stories[event.storyId];
    const penalized = story ? expiryIsPenalized(story.truth, story.priority) : true;
    const { penaltyFactor } = frame.ctx.tuning;
    const scoreDelta = penalized ? scalePenalty(SCORE.expired, penaltyFactor) : 0;
    const credibilityDelta = penalized ? scalePenalty(CREDIBILITY.expired, penaltyFactor) : 0;
    score += scoreDelta;
    credibility = applyCredibility(credibility, credibilityDelta);
    expired.push({
      folderId: event.folderId,
      spawnKey: event.spawnKey,
      storyId: event.storyId,
      outcome: 'expired',
      reason: penalized ? 'expired' : 'expiredUnpenalized',
      verdict: null,
      scoreDelta,
      credibilityDelta,
      justifyingStampIds: [],
      requiredStamps: requiredStampsOf(story ?? {}),
      bonuses: NO_BONUSES,
      missedStampIds: missingProof(story, event.stamps),
    });
  }

  if (expired.length > 0) {
    next = { ...next, score, credibility, results: [...next.results, ...expired] };
  }
  if (next.ended) {
    return next;
  }
  const ended = levelOutcome(next, frame.ctx.level);
  if (!ended) {
    return next;
  }
  const unfinished = unfinishedResults(Object.values(next.folders), frame.ctx.stories);
  return {
    ...next,
    ended,
    results: unfinished.length > 0 ? [...next.results, ...unfinished] : next.results,
  };
}
