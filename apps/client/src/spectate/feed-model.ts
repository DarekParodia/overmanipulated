// The Widownia's event feed (S7-91), pure: what a spectator reads instead of captions. Each
// `spectatorEvent` becomes at most one row: a verdict (correct, weak proof, wrong, or a fake
// published — the blunder), an expired folder, a level event starting, a beaten-off raid, a role
// ability landing or a rescued folder. In versus the embargo (S7-78) sends a closed folder as
// `verdictMasked` until both newsrooms closed its spawn key: its row names only the newsroom
// („Kurier: werdykt”), with no verdict, outcome or points; the `verdictRevealed` that follows
// replaces it with the full row on top. Blunders therefore only ever come from revealed results.
// Also kept here: the verdicts still masked per player, which the stats sheet counts as given but
// leaves out of the accuracy.
import type {
  Ability,
  FolderOutcome,
  FolderReason,
  LevelEventKind,
  SpectatorEventMessage,
  TeamIndex,
} from '@redakcja/shared';

/** Rows the feed keeps, newest first (client presentation). */
export const SPECTATOR_FEED_MAX = 8;
/** Rows on screen: the newest four on a desktop, two on a phone. */
export const FEED_VISIBLE_DESKTOP = 4;
export const FEED_VISIBLE_PHONE = 2;

/** How a revealed (or co-op) verdict went: the row's icon and tone. */
export type FeedTone = 'correct' | 'weak' | 'wrong' | 'blunder';

type Base = { id: number; team: TeamIndex };

export type FeedItem = Base &
  (
    | {
        kind: 'masked';
        playerId: string | null;
        folderId: string;
        spawnKey: string;
        closedBy: 'verdict' | 'expired';
      }
    | {
        kind: 'verdict';
        playerId: string | null;
        folderId: string;
        spawnKey: string;
        tone: FeedTone;
        points: number;
      }
    | {
        kind: 'expired';
        folderId: string;
        /** The points the expiry cost; null when the event does not say (co-op `folderExpired`). */
        points: number | null;
      }
    | { kind: 'event'; event: LevelEventKind }
    | { kind: 'raid' }
    | { kind: 'ability'; playerId: string; ability: Ability }
    | { kind: 'rescue'; playerId: string }
  );

export type FeedKind = FeedItem['kind'];

/** The tone of a closed folder's row; a fake that went to print is the blunder. */
export function feedTone(outcome: FolderOutcome, reason: FolderReason): FeedTone {
  if (reason === 'publishedFake') {
    return 'blunder';
  }
  if (outcome === 'correct') {
    return 'correct';
  }
  return outcome === 'wrongJustification' ? 'weak' : 'wrong';
}

type ClosedFolder = {
  playerId: string | null;
  folderId: string;
  spawnKey: string;
  outcome: FolderOutcome;
  reason: FolderReason;
  scoreDelta: number;
};

function closedRow(id: number, team: TeamIndex, result: ClosedFolder): FeedItem | null {
  if (result.outcome === 'unfinished') {
    return null;
  }
  if (result.outcome === 'expired') {
    return { id, team, kind: 'expired', folderId: result.folderId, points: result.scoreDelta };
  }
  return {
    id,
    team,
    kind: 'verdict',
    playerId: result.playerId,
    folderId: result.folderId,
    spawnKey: result.spawnKey,
    tone: feedTone(result.outcome, result.reason),
    points: result.scoreDelta,
  };
}

/** The row for one spectator event, or null when the feed does not show it. */
export function feedItemFor(message: SpectatorEventMessage, id: number): FeedItem | null {
  const { team, event } = message;
  switch (event.kind) {
    case 'verdictMasked':
      return {
        id,
        team,
        kind: 'masked',
        playerId: event.playerId,
        folderId: event.folderId,
        spawnKey: event.spawnKey,
        closedBy: event.closedBy,
      };
    case 'verdictRevealed':
      return closedRow(id, team, event.result);
    // Only co-op sends these unmasked; in versus they arrive as `verdictMasked`.
    case 'verdictResult':
      return closedRow(id, team, event);
    case 'folderExpired':
      return { id, team, kind: 'expired', folderId: event.folderId, points: null };
    case 'levelEvent':
      return event.phase === 'start' ? { id, team, kind: 'event', event: event.event } : null;
    case 'raidResolved':
      return { id, team, kind: 'raid' };
    case 'ability':
      return event.stage === 'done'
        ? { id, team, kind: 'ability', playerId: event.playerId, ability: event.ability }
        : null;
    case 'folderRescued':
      return { id, team, kind: 'rescue', playerId: event.playerId };
    default:
      return null;
  }
}

/** The masked row a revealed result replaces: same newsroom and folder. */
function revealedBy(item: FeedItem, revealed: FeedItem): boolean {
  return (
    item.kind === 'masked' &&
    item.team === revealed.team &&
    (revealed.kind === 'verdict' || revealed.kind === 'expired') &&
    item.folderId === revealed.folderId
  );
}

/**
 * The feed after one spectator event, newest first and at most SPECTATOR_FEED_MAX rows. A revealed
 * result takes the place of its masked row (and goes on top). Returns `feed` itself when the event
 * shows nothing.
 */
export function pushFeed(
  feed: readonly FeedItem[],
  message: SpectatorEventMessage,
  id: number,
): readonly FeedItem[] {
  const item = feedItemFor(message, id);
  if (!item) {
    return feed;
  }
  const rest =
    message.event.kind === 'verdictRevealed'
      ? feed.filter((entry) => !revealedBy(entry, item))
      : feed;
  return [item, ...rest].slice(0, SPECTATOR_FEED_MAX);
}

/** A verdict given in versus whose result the embargo still holds. */
export type PendingVerdict = { team: TeamIndex; playerId: string; folderId: string };

/** The verdicts still masked after one spectator event. */
export function pendingAfter(
  pending: readonly PendingVerdict[],
  message: SpectatorEventMessage,
): readonly PendingVerdict[] {
  const { team, event } = message;
  if (event.kind === 'verdictMasked' && event.closedBy === 'verdict' && event.playerId !== null) {
    return [...pending, { team, playerId: event.playerId, folderId: event.folderId }];
  }
  if (event.kind === 'verdictRevealed') {
    const { folderId } = event.result;
    const rest = pending.filter((entry) => !(entry.team === team && entry.folderId === folderId));
    return rest.length === pending.length ? pending : rest;
  }
  return pending;
}
