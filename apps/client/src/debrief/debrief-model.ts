// Pure helpers behind the debrief (Kolegium): one card per story in order of arrival, and the
// blunder-of-the-day vote tallies with this player's optimistic vote. Free of React and of the
// content module so they are unit-tested directly.
import type {
  BlunderVote,
  FolderOutcome,
  FolderResult,
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
  /** The team's verdict; null when the folder expired. */
  verdict: Verdict | null;
  correctVerdict: Verdict | null;
  scoreDelta: number;
  debrief: DebriefStory['debrief'] | null;
  missedStamps: MissedStamp[];
};

/** Folder ids are `f<n>` in spawn order; anything else sorts after them, in list order. */
function arrivalNumber(folderId: string): number {
  const match = /^f(\d+)$/.exec(folderId);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/**
 * One card per story, in the order the folders arrived (results come in resolution order).
 * A story that came twice keeps its first folder.
 */
export function debriefCards(
  results: readonly FolderResult[],
  lookup: DebriefStoryLookup,
): DebriefCard[] {
  const ordered = results
    .map((result, index) => ({ result, index }))
    .sort(
      (a, b) =>
        arrivalNumber(a.result.folderId) - arrivalNumber(b.result.folderId) || a.index - b.index,
    );
  const seen = new Set<string>();
  const cards: DebriefCard[] = [];
  for (const { result } of ordered) {
    if (seen.has(result.storyId)) {
      continue;
    }
    seen.add(result.storyId);
    const story = lookup(result.storyId);
    const stamps = story?.stamps ?? [];
    cards.push({
      storyId: result.storyId,
      folderId: result.folderId,
      headline: story?.headline ?? null,
      outcome: result.outcome,
      verdict: result.verdict,
      correctVerdict: story?.correctVerdict ?? null,
      scoreDelta: result.scoreDelta,
      debrief: story?.debrief ?? null,
      missedStamps: result.missedStampIds.flatMap((id) => {
        const stamp = stamps.find((s) => s.id === id);
        return stamp ? [{ id: stamp.id, station: stamp.station, text: stamp.text }] : [];
      }),
    });
  }
  return cards;
}

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
