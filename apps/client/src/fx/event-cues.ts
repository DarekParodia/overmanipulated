// Pure mapping from server gameplay events to feedback cues (agents/game-feel.md catalogue).
// Kept free of stores and the runtime so every event kind can be unit-tested.
import type { GameEvent, Truth, Verdict } from '@redakcja/shared';
import { palette } from '../ui/tokens.ts';
import type { CueId } from './cues.ts';

export type GameplayEvent = Exclude<
  GameEvent,
  { kind: 'playerJoined' | 'playerLeft' | 'playerReconnected' | 'gameStarted' }
>;

type VerdictEvent = Extract<GameplayEvent, { kind: 'verdictResult' }>;

/** Colour of each verdict's stamp (tokens: copy blue = publish, red = reject, ochre = context). */
export const verdictColors: Record<Verdict, string> = {
  publish: palette.copyBlue,
  reject: palette.editorialRed,
  publishWithContext: palette.ochre,
};

/**
 * Which "wrong" a wrong verdict is. Publishing a fake must feel worse than anything else
 * (game-feel.md, Severity): any published false/unverifiable story, or misleading/satire
 * published without context, is a published fake; rejecting publishable material is a rejected
 * truth; a needless context note on a true story is a plain wrong verdict.
 */
export function wrongVerdictCue(verdict: Verdict, truth: Truth | undefined): CueId {
  if (verdict === 'reject') {
    return 'verdict.truthRejected';
  }
  if (truth === 'true') {
    return 'verdict.wrong';
  }
  return 'verdict.fakePublished';
}

export function verdictCue(event: VerdictEvent, truth: Truth | undefined): CueId {
  switch (event.outcome) {
    case 'correct':
      return event.verdict === 'publishWithContext' ? 'verdict.contextCorrect' : 'verdict.correct';
    case 'wrongJustification':
      return 'verdict.wrongJustification';
    case 'wrong':
      return wrongVerdictCue(event.verdict, truth);
    case 'expired':
      return 'folder.expired';
  }
}

/** The cue for a gameplay event. `truthOf` looks up a story's truth (for wrong verdicts). */
export function cueForEvent(
  event: GameplayEvent,
  truthOf: (storyId: string) => Truth | undefined,
): CueId {
  switch (event.kind) {
    case 'folderSpawned':
      return 'folder.arrive';
    case 'folderPickedUp':
      return 'folder.pickup';
    case 'folderPutDown':
      return 'folder.drop';
    case 'deadlineWarning':
      return 'folder.deadlineWarning';
    case 'folderExpired':
      return 'folder.expired';
    case 'deadlineExtended':
      return 'folder.deadlineExtended';
    case 'workStarted':
      return 'station.workStart';
    case 'workCancelled':
      return 'station.workCancel';
    case 'minigameStarted':
      return 'minigame.start';
    case 'minigameFailed':
      return 'minigame.fail';
    case 'stampApplied':
      return 'stamp.applied';
    case 'deskOpened':
      return 'desk.open';
    case 'deskClosed':
      return 'desk.close';
    case 'verdictResult':
      return verdictCue(event, truthOf(event.storyId));
    case 'ping':
      switch (event.ping) {
        case 'needArchive':
          return 'ping.needArchive';
        case 'fake':
          return 'ping.fake';
        case 'mine':
          return 'ping.mine';
      }
  }
}
