// Editorial desk: opening the verdict sheet, verdict evaluation and justification (S2-07).
// Emits: deskOpened, deskClosed, verdictResult (with score/credibility deltas applied here).
// Consumes commands: verdict, cancel (when operating a desk), extendDeadline.
import {
  CREDIBILITY,
  DEADLINE_EXTENSION_MS,
  SCORE,
  SPEED_BONUS_REMAINING_FRACTION,
  WRONG_JUSTIFICATION_SCORE_FACTOR,
  WRONG_VERDICT_PENALTY,
} from '../constants.ts';
import type { Verdict } from '../domain.ts';
import type { Desk, Folder, FolderOutcome } from '../entities.ts';
import type { SimStory } from './content.ts';
import type { SimFrame } from './frame.ts';
import { findInteractionTarget } from './map.ts';
import { applyCredibility } from './scoring.ts';
import { folderOnFixture, type GameState } from './state.ts';

export type VerdictEvaluation = {
  outcome: Exclude<FolderOutcome, 'expired'>;
  scoreDelta: number;
  /** The table value; the state's credibility is clamped when it is applied. */
  credibilityDelta: number;
  speedBonus: boolean;
  /** Justifying stamps the folder does not carry. */
  missedStampIds: string[];
};

/** Points and credibility for a correct verdict, before speed bonus and justification. */
function correctReward(story: SimStory, verdict: Verdict): { score: number; credibility: number } {
  if (verdict === 'publishWithContext') {
    return { score: SCORE.correctWithContext, credibility: CREDIBILITY.correctWithContext };
  }
  if (story.priority === 'important' || story.priority === 'urgent') {
    return { score: SCORE.correctImportant, credibility: CREDIBILITY.correctImportant };
  }
  return { score: SCORE.correctNormal, credibility: 0 };
}

/** Penalty for a verdict that is not the story's correct one, by what actually happened. */
function wrongPenalty(story: SimStory, verdict: Verdict): { score: number; credibility: number } {
  switch (story.truth) {
    case 'false':
    case 'unverifiable':
      // Any kind of publication puts a fake (or an unchecked claim) in front of readers.
      return { score: SCORE.publishedFake, credibility: CREDIBILITY.publishedFake };
    case 'true':
      return verdict === 'reject'
        ? { score: SCORE.rejectedTrue, credibility: CREDIBILITY.rejectedTrue }
        : WRONG_VERDICT_PENALTY.contextOnTrue;
    case 'misleading':
    case 'satire':
      return verdict === 'publish'
        ? WRONG_VERDICT_PENALTY.publishedWithoutContext
        : WRONG_VERDICT_PENALTY.rejectedContextStory;
  }
}

/**
 * Evaluates a verdict on a folder at level time `nowMs` (design doc, "Werdykty" and
 * "Punktacja"). The justification is valid only if the stamp justifies the story's verdict and
 * the team actually collected it.
 */
export function evaluateVerdict(
  story: SimStory,
  folder: Folder,
  verdict: Verdict,
  justifyingStampId: string,
  nowMs: number,
): VerdictEvaluation {
  const missedStampIds = story.justifyingStamps.filter((id) => !folder.stamps.includes(id));
  if (verdict !== story.correctVerdict) {
    const penalty = wrongPenalty(story, verdict);
    return {
      outcome: 'wrong',
      scoreDelta: penalty.score,
      credibilityDelta: penalty.credibility,
      speedBonus: false,
      missedStampIds,
    };
  }
  const reward = correctReward(story, verdict);
  const justified =
    story.justifyingStamps.includes(justifyingStampId) && folder.stamps.includes(justifyingStampId);
  if (!justified) {
    return {
      outcome: 'wrongJustification',
      scoreDelta: Math.round(reward.score * WRONG_JUSTIFICATION_SCORE_FACTOR),
      credibilityDelta: 0,
      speedBonus: false,
      missedStampIds,
    };
  }
  const totalMs = folder.deadlineMs - folder.spawnedAtMs;
  const speedBonus = folder.deadlineMs - nowMs > totalMs * SPEED_BONUS_REMAINING_FRACTION;
  return {
    outcome: 'correct',
    scoreDelta: reward.score + (speedBonus ? SCORE.speedBonus : 0),
    credibilityDelta: reward.credibility,
    speedBonus,
    missedStampIds,
  };
}

/**
 * Whether a player may use the managing editor's deadline extension: the managing editor, or,
 * when nobody took that role and at most three play, anyone (design doc: with three players the
 * person at the desk takes the role; simplified to any player).
 */
export function canExtendDeadline(state: GameState, playerId: string): boolean {
  if (state.crew[playerId]?.role === 'managingEditor') {
    return true;
  }
  return (
    playerId in state.crew &&
    !Object.values(state.crew).some((member) => member.role === 'managingEditor') &&
    Object.keys(state.players).length <= 3
  );
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
        const result = evaluateVerdict(
          story,
          folder,
          command.verdict,
          command.justifyingStampId,
          next.elapsedMs,
        );
        const { [folder.id]: _removed, ...folders } = next.folders;
        next = {
          ...next,
          folders,
          score: next.score + result.scoreDelta,
          credibility: applyCredibility(next.credibility, result.credibilityDelta),
          results: [
            ...next.results,
            {
              folderId: folder.id,
              storyId: story.id,
              outcome: result.outcome,
              verdict: command.verdict,
              scoreDelta: result.scoreDelta,
              credibilityDelta: result.credibilityDelta,
              missedStampIds: result.missedStampIds,
            },
          ],
        };
        frame.events.push({
          kind: 'verdictResult',
          folderId: folder.id,
          storyId: story.id,
          playerId,
          verdict: command.verdict,
          justifyingStampId: command.justifyingStampId,
          outcome: result.outcome,
          scoreDelta: result.scoreDelta,
          credibilityDelta: result.credibilityDelta,
          speedBonus: result.speedBonus,
          missedStampIds: result.missedStampIds,
        });
        close(desk.id, playerId);
        break;
      }
      case 'extendDeadline': {
        const folder = next.folders[command.folderId];
        if (next.deadlineExtensionUsed || !folder || !canExtendDeadline(next, playerId)) {
          break;
        }
        next = {
          ...next,
          deadlineExtensionUsed: true,
          folders: {
            ...next.folders,
            [folder.id]: {
              ...folder,
              deadlineMs: folder.deadlineMs + DEADLINE_EXTENSION_MS,
              warned: false,
            },
          },
        };
        frame.events.push({ kind: 'deadlineExtended', folderId: folder.id, playerId });
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
