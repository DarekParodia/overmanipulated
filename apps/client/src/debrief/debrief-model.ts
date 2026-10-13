// Pure helpers behind the debrief (Kolegium): the card and story shapes (the cards themselves
// come from `kolegiumCards` in results-model.ts) and the blunder-of-the-day vote tallies with
// this player's optimistic vote. Free of React and of the content module so they are
// unit-tested directly.
import type {
  BlunderVote,
  FolderOutcome,
  FolderReason,
  LobbyPlayer,
  StationKind,
  Verdict,
} from '@redakcja/shared';

/** Story facts the debrief needs; a subset of the content `Story`. */
export type DebriefStory = {
  headline: string;
  correctVerdict?: Verdict;
  stamps?: readonly { id: string; station: StationKind; text: string }[];
  debrief?: { what: string; technique: string; tool: string; realWorld: string };
};

export type DebriefStoryLookup = (storyId: string) => DebriefStory | undefined;

export type MissedStamp = { id: string; station: StationKind; text: string };

export type DebriefCard = {
  storyId: string;
  folderId: string;
  headline: string | null;
  outcome: FolderOutcome;
  /** Why the folder ended that way; picks the card's title (`pl.outcome.title`). */
  reason: FolderReason;
  /** The team's verdict; null when the folder expired. */
  verdict: Verdict | null;
  correctVerdict: Verdict | null;
  scoreDelta: number;
  debrief: DebriefStory['debrief'] | null;
  /** Deciding proof nobody checked; hint-only stamps (the AI scanner) are never proof. */
  missedStamps: MissedStamp[];
};

/**
 * The votes to show: the server's, with this player's pending vote in place of their server
 * one until the server confirms it (one vote per player).
 */
export function effectiveVotes(
  serverVotes: readonly BlunderVote[],
  playerId: string | null,
  pendingStoryId: string | null,
): BlunderVote[] {
  if (playerId === null || pendingStoryId === null) {
    return [...serverVotes];
  }
  return [
    ...serverVotes.filter((vote) => vote.playerId !== playerId),
    { playerId, storyId: pendingStoryId },
  ];
}

/** True once the server's state carries the pending vote, so it can be dropped. */
export function voteConfirmed(
  serverVotes: readonly BlunderVote[],
  playerId: string | null,
  pendingStoryId: string | null,
): boolean {
  return serverVotes.some((v) => v.playerId === playerId && v.storyId === pendingStoryId);
}

export type Voter = { playerId: string; colorIndex: number };

/** Voters per story, in roster order so the dots never jump around. */
export function votersByStory(
  votes: readonly BlunderVote[],
  players: readonly Pick<LobbyPlayer, 'id' | 'colorIndex'>[],
): Map<string, Voter[]> {
  const byStory = new Map<string, Voter[]>();
  const order = new Map(players.map((p, i) => [p.id, i]));
  const sorted = [...votes].sort(
    (a, b) =>
      (order.get(a.playerId) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.playerId) ?? Number.MAX_SAFE_INTEGER),
  );
  for (const vote of sorted) {
    const colorIndex = players.find((p) => p.id === vote.playerId)?.colorIndex ?? 0;
    const list = byStory.get(vote.storyId) ?? [];
    list.push({ playerId: vote.playerId, colorIndex });
    byStory.set(vote.storyId, list);
  }
  return byStory;
}

/** The story with the most votes; none on a tie or with no votes. */
export function blunderLeader(voters: ReadonlyMap<string, readonly Voter[]>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [storyId, list] of voters) {
    if (list.length > bestCount) {
      best = storyId;
      bestCount = list.length;
      tied = false;
    } else if (list.length === bestCount) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** Index of the next card in a direction, clamped to the list. */
export function stepCard(current: number, delta: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.max(0, Math.min(count - 1, current + delta));
}
