// Editorial desk: opening the verdict sheet, verdict evaluation and justification (S2-07).
// Emits: deskOpened, deskClosed, verdictResult (with score/credibility deltas applied here).
// Level-event folders (S4-05..S4-09): correction filing, bossCall bonus, botRaid resolution.
// Consumes commands: verdict, cancel (when operating a desk).
import {
  CREDIBILITY,
  EVENTS,
  SCORE,
  SPEED_BONUS_REMAINING_FRACTION,
  WRONG_JUSTIFICATION_SCORE_FACTOR,
  WRONG_VERDICT_PENALTY,
} from '../constants.ts';
import { NORMAL_TUNING, type SimTuning } from '../difficulty.ts';
import type { Verdict } from '../domain.ts';
import {
  type Desk,
  type Folder,
  type FolderOutcome,
  type FolderReason,
  type FolderResult,
  NO_BONUSES,
} from '../entities.ts';
import { countsAsProof, requiredStampsOf, type SimStory } from './content.ts';
import { endActiveEvent, raidOfFolder } from './events.ts';
import type { SimFrame } from './frame.ts';
import { findInteractionTarget } from './map.ts';
import { applyCredibility, scalePenalty } from './scoring.ts';
import { folderOnFixture, type GameState } from './state.ts';

/**
 * What a verdict earns; the rest of the folder result comes from the folder and the command.
 * `credibilityDelta` is the table value (a penalty scaled by the difficulty); the state's
 * credibility is clamped when it is applied.
 */
export type VerdictEvaluation = Pick<
  FolderResult,
  'reason' | 'scoreDelta' | 'credibilityDelta' | 'bonuses' | 'missedStampIds'
> & {
  outcome: Exclude<FolderOutcome, 'expired' | 'unfinished'>;
};

type Reward = { score: number; credibility: number; reason: FolderReason };

/** Points and credibility for a correct verdict, before speed bonus and justification. */
function correctReward(story: SimStory, verdict: Verdict): Reward {
  if (verdict === 'publishWithContext') {
    return {
      score: SCORE.correctWithContext,
      credibility: CREDIBILITY.correctWithContext,
      reason: 'correctWithContext',
    };
  }
  if (story.priority === 'important' || story.priority === 'urgent') {
    return {
      score: SCORE.correctImportant,
      credibility: CREDIBILITY.correctImportant,
      reason: 'correctImportant',
    };
  }
  return { score: SCORE.correctNormal, credibility: 0, reason: 'correctNormal' };
}

/**
 * Penalty for a verdict that is not the story's correct one, by what actually happened, at the
 * difficulty's `penaltyFactor`.
 */
function wrongPenalty(story: SimStory, verdict: Verdict, penaltyFactor: number): Reward {
  const table = tablePenalty(story, verdict);
  return {
    score: scalePenalty(table.score, penaltyFactor),
    credibility: scalePenalty(table.credibility, penaltyFactor),
    reason: table.reason,
  };
}

/** The scoring-table penalty for a wrong verdict, before difficulty scaling. */
function tablePenalty(story: SimStory, verdict: Verdict): Reward {
  switch (story.truth) {
    case 'false':
    case 'unverifiable':
      // Any kind of publication puts a fake (or an unchecked claim) in front of readers.
      return {
        score: SCORE.publishedFake,
        credibility: CREDIBILITY.publishedFake,
        reason: 'publishedFake',
      };
    case 'true':
      return verdict === 'reject'
        ? {
            score: SCORE.rejectedTrue,
            credibility: CREDIBILITY.rejectedTrue,
            reason: 'rejectedTrue',
          }
        : { ...WRONG_VERDICT_PENALTY.contextOnTrue, reason: 'contextOnTrue' };
    case 'misleading':
    case 'satire':
      return verdict === 'publish'
        ? { ...WRONG_VERDICT_PENALTY.publishedWithoutContext, reason: 'publishedWithoutContext' }
        : { ...WRONG_VERDICT_PENALTY.rejectedContextStory, reason: 'rejectedContextStory' };
  }
}

/** The cited stamp ids without duplicates, in citing order. */
export function uniqueCites(citedStampIds: readonly string[]): string[] {
  return [...new Set(citedStampIds)];
}

/**
 * Evaluates a verdict on a folder at level time `nowMs` (design doc, "Werdykty" and
 * "Punktacja"). Cites are deduped. A cite is valid proof only if the stamp justifies the story's
 * verdict and the team collected it; hint-only stamps (the AI scanner) may be valid but never
 * count toward the `requiredStampsOf(story)` proofs.
 * 1. Wrong verdict → `wrong`, the penalty of what actually happened, scaled by
 *    `tuning.penaltyFactor` (rewards are never scaled).
 * 2. Any cite that is not valid proof → `wrongJustification` / `weakProof`, half points.
 * 3. Fewer countable proofs than required → `wrongJustification` / `incompleteProof`, half
 *    points (citing only the AI scanner lands here).
 * 4. Otherwise `correct`, with the speed bonus (measured against the deadline without the time
 *    abilities added, `deadlineMs − extendedMs`) and the multi-stamp bonus
 *    (`(N − 1) × SCORE.multiStampBonus`, never scaled by the difficulty); nothing is reported
 *    missed.
 */
export function evaluateVerdict(
  story: SimStory,
  folder: Folder,
  verdict: Verdict,
  citedStampIds: readonly string[],
  nowMs: number,
  tuning: SimTuning = NORMAL_TUNING,
): VerdictEvaluation {
  const missedStampIds = story.justifyingStamps.filter((id) => !folder.stamps.includes(id));
  if (verdict !== story.correctVerdict) {
    const penalty = wrongPenalty(story, verdict, tuning.penaltyFactor);
    return {
      outcome: 'wrong',
      reason: penalty.reason,
      scoreDelta: penalty.score,
      credibilityDelta: penalty.credibility,
      bonuses: NO_BONUSES,
      missedStampIds,
    };
  }
  const reward = correctReward(story, verdict);
  const cited = uniqueCites(citedStampIds);
  const valid = cited.filter(
    (id) => story.justifyingStamps.includes(id) && folder.stamps.includes(id),
  );
  const countable = valid.filter((id) => countsAsProof(story, id));
  const required = requiredStampsOf(story);
  if (valid.length < cited.length || countable.length < required) {
    return {
      outcome: 'wrongJustification',
      reason: valid.length < cited.length ? 'weakProof' : 'incompleteProof',
      scoreDelta: Math.round(reward.score * WRONG_JUSTIFICATION_SCORE_FACTOR),
      credibilityDelta: 0,
      bonuses: NO_BONUSES,
      missedStampIds,
    };
  }
  // Time added by Przedłużenie or Koło ratunkowe does not count toward the speed bonus.
  const baseDeadlineMs = folder.deadlineMs - (folder.extendedMs ?? 0);
  const totalMs = baseDeadlineMs - folder.spawnedAtMs;
  const fast = baseDeadlineMs - nowMs > totalMs * SPEED_BONUS_REMAINING_FRACTION;
  const speed = fast ? SCORE.speedBonus : 0;
  const multiStamp = (required - 1) * SCORE.multiStampBonus;
  return {
    outcome: 'correct',
    reason: reward.reason,
    scoreDelta: reward.score + speed + multiStamp,
    credibilityDelta: reward.credibility,
    bonuses: { speed, multiStamp, bossCall: 0 },
    missedStampIds: [],
  };
}

/**
 * `evaluateVerdict` plus the rules of level-event folders (S4-05..S4-09): a correction filed with
 * `publishWithContext` recovers credibility whatever the stamp, and obeying a bossCall on a true
 * story in time adds a bonus. Everything else is judged as usual.
 */
function evaluateTagged(
  story: SimStory,
  folder: Folder,
  verdict: Verdict,
  citedStampIds: readonly string[],
  nowMs: number,
  tuning: SimTuning,
): VerdictEvaluation {
  const tag = folder.tag;
  if (tag?.kind === 'correction' && verdict === 'publishWithContext') {
    return {
      outcome: 'correct',
      reason: 'correctionFiled',
      scoreDelta: EVENTS.correctionScore,
      credibilityDelta: tag.recoverCredibility,
      bonuses: NO_BONUSES,
      missedStampIds: [],
    };
  }
  const result = evaluateVerdict(story, folder, verdict, citedStampIds, nowMs, tuning);
  if (
    tag?.kind === 'bossCall' &&
    verdict === 'publish' &&
    story.truth === 'true' &&
    nowMs <= tag.untilMs
  ) {
    return {
      ...result,
      scoreDelta: result.scoreDelta + EVENTS.bossCallBonusScore,
      bonuses: { ...result.bonuses, bossCall: EVENTS.bossCallBonusScore },
    };
  }
  return result;
}

/** One verdict on a botRaid folder resolves the whole wave: siblings vanish without results. */
function resolveRaid(state: GameState, frame: SimFrame, folder: Folder): GameState {
  const raid = folder.tag?.kind === 'botRaid' ? raidOfFolder(state, folder.id) : undefined;
  if (!raid) {
    return state;
  }
  const siblings = raid.folderIds.filter((id) => id !== folder.id && id in state.folders);
  const folders = { ...state.folders };
  for (const id of siblings) {
    delete folders[id];
  }
  frame.events.push({
    kind: 'raidResolved',
    raidId: raid.raidId ?? '',
    byFolderId: folder.id,
    folderIds: siblings,
  });
  return endActiveEvent({ ...state, folders }, frame, raid);
}

function deskOf(desks: Record<string, Desk>, playerId: string): Desk | undefined {
  return Object.values(desks).find((desk) => desk.operatorId === playerId);
}

export function stepDesk(state: GameState, frame: SimFrame): GameState {
  const { map, stories } = frame.ctx;
  let next = state;
  const desks = { ...state.desks };
  const eventsBefore = frame.events.length;
  /** Players whose sheet closed this tick do not reopen it in the same tick. */
  const closedThisTick = new Set<string>();

  const close = (deskId: string, playerId: string): void => {
    closedThisTick.add(playerId);
    const desk = desks[deskId];
    if (desk) {
      desks[deskId] = { ...desk, operatorId: null };
    }
    frame.events.push({ kind: 'deskClosed', deskId, playerId });
  };

  // 1. Commands, in arrival order.
  for (const { playerId, command } of frame.commands) {
    switch (command.kind) {
      case 'cancel': {
        const desk = deskOf(desks, playerId);
        if (desk) {
          close(desk.id, playerId);
        }
        break;
      }
      case 'verdict': {
        const desk = deskOf(desks, playerId);
        const folder = desk ? folderOnFixture(next, desk.id) : undefined;
        const story = folder ? stories[folder.storyId] : undefined;
        if (!desk || !folder || !story || folder.id !== command.folderId) {
          break;
        }
        const evaluation = evaluateTagged(
          story,
          folder,
          command.verdict,
          command.justifyingStampIds,
          next.elapsedMs,
          frame.ctx.tuning,
        );
        const result: FolderResult = {
          folderId: folder.id,
          spawnKey: folder.spawnKey,
          storyId: story.id,
          ...evaluation,
          verdict: command.verdict,
          justifyingStampIds: uniqueCites(command.justifyingStampIds),
          requiredStamps: requiredStampsOf(story),
        };
        const { [folder.id]: _removed, ...folders } = next.folders;
        next = {
          ...next,
          folders,
          score: next.score + result.scoreDelta,
          credibility: applyCredibility(next.credibility, result.credibilityDelta),
          results: [...next.results, result],
        };
        frame.events.push({
          kind: 'verdictResult',
          ...result,
          verdict: command.verdict,
          playerId,
        });
        next = resolveRaid(next, frame, folder);
        close(desk.id, playerId);
        break;
      }
      default:
        break;
    }
  }

  // 2. Release desks whose operator left, walked away or whose folder disappeared. Runs after
  //    the commands so a verdict sent in the same tick as a stray movement input still counts.
  for (const desk of Object.values(desks)) {
    const operatorId = desk.operatorId;
    if (operatorId === null) {
      continue;
    }
    const player = next.players[operatorId];
    const atDesk =
      player !== undefined &&
      !frame.intents[operatorId]?.moving &&
      findInteractionTarget(map, player, player.facing)?.id === desk.id;
    if (!atDesk || !folderOnFixture(next, desk.id)) {
      close(desk.id, operatorId);
    }
  }

  // 3. Open the sheet for players holding work at a desk with a folder on it.
  for (const [playerId, intent] of Object.entries(frame.intents)) {
    const player = next.players[playerId];
    if (
      !player ||
      !intent.work ||
      intent.moving ||
      closedThisTick.has(playerId) ||
      deskOf(desks, playerId)
    ) {
      continue;
    }
    if (Object.values(next.stations).some((station) => station.operatorId === playerId)) {
      continue;
    }
    const target = findInteractionTarget(map, player, player.facing);
    const desk = target?.kind === 'desk' ? desks[target.id] : undefined;
    const folder = desk ? folderOnFixture(next, desk.id) : undefined;
    if (!desk || !folder || desk.operatorId !== null) {
      continue;
    }
    desks[desk.id] = { ...desk, operatorId: playerId };
    frame.events.push({ kind: 'deskOpened', deskId: desk.id, playerId, folderId: folder.id });
  }

  return next === state && frame.events.length === eventsBefore ? state : { ...next, desks };
}
