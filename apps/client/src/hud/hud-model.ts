// Pure helpers behind the HUD: queue order, the next folder, clock formatting, folder location
// labels and the verdict toast text (titles by reason, shared with the desk and the Kolegium).
// Kept free of React so they are unit-tested directly.
import {
  CREDIBILITY as CREDIBILITY_DELTAS,
  countsAsProof,
  DEADLINE_WARNING_MS,
  expiryIsPenalized,
  type Folder,
  type FolderOutcome,
  type FolderReason,
  type NextFolder,
  type Priority,
  type ProofStory,
  requiredStampsOf,
  SCORE,
  STATION_KINDS,
  type StationKind,
  type StoryType,
  scalePenalty,
  type Truth,
} from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { formatNumber } from '../strings/typography.ts';

/** Story facts the HUD needs; a subset of the content `Story`. */
export type StoryInfo = {
  headline: string;
  type: StoryType;
  priority: Priority;
  truth: Truth;
  /** Proofs a verdict must cite (S7-19); absent means 1. */
  requiredStamps?: number;
  /**
   * The stamps and which of them justify, for the evidence badge; absent counts no proof. The
   * stamp keeps its `text` so a `StoryInfo` still serves as a debrief story.
   */
  stamps?: readonly (ProofStory['stamps'][number] & { text: string })[];
  justifyingStamps?: ProofStory['justifyingStamps'];
};

export type StoryLookup = (storyId: string) => StoryInfo | undefined;

/** Folders by deadline (most urgent first); ties broken by id so the order never flickers. */
export function sortQueue(folders: readonly Folder[]): Folder[] {
  return [...folders].sort((a, b) => a.deadlineMs - b.deadlineMs || a.id.localeCompare(b.id));
}

export function folderTimeLeftMs(folder: Folder, elapsedMs: number): number {
  return Math.max(0, folder.deadlineMs - elapsedMs);
}

export function isDeadlineWarning(folder: Folder, elapsedMs: number): boolean {
  return folderTimeLeftMs(folder, elapsedMs) < DEADLINE_WARNING_MS;
}

/** The next scheduled folder as the queue shows it (S7-09 ghost card). */
export type NextFolderState = { kind: 'in'; ms: number } | { kind: 'full' } | { kind: 'none' };

/**
 * `full` while a due folder waits for a free conveyor tile; otherwise the time until the next
 * scheduled folder arrives (never below 0, `elapsedMs` being the HUD's level clock), or `none`
 * once the schedule is used up. Level-event folders are never announced.
 */
export function nextFolderState(
  next: NextFolder | null,
  full: boolean,
  elapsedMs: number,
): NextFolderState {
  if (full) {
    return { kind: 'full' };
  }
  if (!next) {
    return { kind: 'none' };
  }
  return { kind: 'in', ms: Math.max(0, next.atMs - elapsedMs) };
}

/** Evidence badge of a multi-stamp folder card: `have` is null when hints are off. */
export type EvidenceBadge = { have: number | null; need: number };

/**
 * The badge for a folder whose story needs N ≥ 2 proofs (null otherwise). With hints on it
 * counts the distinct stamps on the folder that count as proof, capped at N ("1/2"); guidance
 * already points at the stations that prove a verdict, so this reveals nothing new. With hints
 * off it shows only N ("×2"), so it never tells which stamps decide.
 */
export function evidenceBadge(
  folder: Pick<Folder, 'stamps'>,
  story: StoryInfo | undefined,
  hintsOn: boolean,
): EvidenceBadge | null {
  if (!story) {
    return null;
  }
  const need = requiredStampsOf(story);
  if (need < 2) {
    return null;
  }
  if (!hintsOn) {
    return { have: null, need };
  }
  const { stamps, justifyingStamps } = story;
  const proofs =
    stamps && justifyingStamps
      ? [...new Set(folder.stamps)].filter((id) => countsAsProof({ stamps, justifyingStamps }, id))
      : [];
  return { have: Math.min(proofs.length, need), need };
}

/** `m:ss`, rounding up so "0:00" only shows when time is really out. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Folder countdown: `m:ss`, switching to tenths (`9,4`) under ten seconds. */
export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped >= 10_000) {
    return formatClock(clamped);
  }
  const tenths = Math.ceil(clamped / 100);
  return `${Math.floor(tenths / 10)},${tenths % 10}`;
}

/** Signed delta with a real minus sign (typographic, not a hyphen). */
export function formatDelta(delta: number): string {
  if (delta > 0) {
    return `+${delta}`;
  }
  if (delta < 0) {
    return `−${Math.abs(delta)}`;
  }
  return '0';
}

/** Score with grouped thousands and a real minus sign (design-rules §4). */
export function formatScore(score: number): string {
  const grouped = formatNumber(Math.abs(score));
  return Math.round(score) < 0 ? `\u2212${grouped}` : grouped;
}

/** Where a folder is, as one of the status icons on its queue card. */
export type LocationKind = 'carried' | 'station' | 'desk' | 'waiting';

export function locationKind(folder: Folder): LocationKind {
  const { location } = folder;
  if (location.kind === 'carried') {
    return 'carried';
  }
  if (location.kind === 'fixture') {
    const prefix = location.fixtureId.replace(/-\d+$/, '');
    if ((STATION_KINDS as readonly string[]).includes(prefix)) {
      return 'station';
    }
    if (prefix === 'desk') {
      return 'desk';
    }
  }
  return 'waiting';
}

/** Where a folder is, in a few words, e.g. "niesie Zośka", "Archiwum", "na taśmie". */
export function locationLabel(
  folder: Folder,
  nicknameOf: (playerId: string) => string | undefined,
): string {
  const { location } = folder;
  const strings = pl.hud.location;
  switch (location.kind) {
    case 'carried': {
      const nickname = nicknameOf(location.playerId);
      return nickname ? strings.carriedBy(nickname) : strings.carried;
    }
    case 'floor':
      return strings.floor;
    case 'fixture': {
      const prefix = location.fixtureId.replace(/-\d+$/, '');
      if ((STATION_KINDS as readonly string[]).includes(prefix)) {
        return pl.vocab.stations[prefix as StationKind];
      }
      if (prefix === 'conveyor' || prefix === 'desk' || prefix === 'table') {
        return strings[prefix];
      }
      return strings.table;
    }
  }
}

/** `info` (blue) is news that is neither good nor bad: a new spectator (S7-86). */
export type ToastTone = 'good' | 'caution' | 'bad' | 'info';

export type ToastSlip = {
  id: string;
  title: string;
  /** Story headline (a spectator's nickname), read out by screen readers only. */
  headline: string;
  /** Score delta, or null when the event carries none worth showing. */
  scoreDelta: number | null;
  credibilityDelta: number;
  tone: ToastTone;
  /** Outcome shape (tick, cross, hourglass; an eye for a spectator) so it never depends on colour alone. */
  mark: 'publish' | 'reject' | 'expired' | 'eye';
};

const TONE: Record<FolderOutcome, ToastTone> = {
  correct: 'good',
  wrongJustification: 'caution',
  wrong: 'bad',
  expired: 'bad',
  unfinished: 'caution',
};

const MARK: Record<FolderOutcome, ToastSlip['mark']> = {
  correct: 'publish',
  wrongJustification: 'publish',
  wrong: 'reject',
  expired: 'expired',
  unfinished: 'expired',
};

/** The toast for a verdict; its title is the folder result's title by reason (`pl.outcome`). */
export function verdictToast(
  event: {
    folderId: string;
    storyId: string;
    outcome: FolderOutcome;
    reason: FolderReason;
    scoreDelta: number;
    credibilityDelta: number;
  },
  story: StoryInfo | undefined,
  serial: number,
): ToastSlip {
  return {
    id: `${event.folderId}:${serial}`,
    title: pl.outcome.title[event.reason],
    headline: story?.headline ?? pl.hud.untitled,
    scoreDelta: event.scoreDelta,
    credibilityDelta: event.credibilityDelta,
    tone: TONE[event.outcome],
    mark: MARK[event.outcome],
  };
}

/**
 * `folderExpired` carries no deltas; they follow the scoring table (design doc, Punktacja),
 * scaled like the sim scales them: `scalePenalty(·, penaltyFactor)` of the room's difficulty.
 */
export function expiredToast(
  event: { folderId: string; storyId: string },
  story: StoryInfo | undefined,
  serial: number,
  penaltyFactor = 1,
): ToastSlip {
  const penalized = story ? expiryIsPenalized(story.truth, story.priority) : true;
  const reason: FolderReason = penalized ? 'expired' : 'expiredUnpenalized';
  return {
    id: `${event.folderId}:${serial}`,
    title: pl.outcome.title[reason],
    headline: story?.headline ?? pl.hud.untitled,
    scoreDelta: penalized ? scalePenalty(SCORE.expired, penaltyFactor) : null,
    credibilityDelta: penalized ? scalePenalty(CREDIBILITY_DELTAS.expired, penaltyFactor) : 0,
    tone: 'bad',
    mark: 'expired',
  };
}

/** Someone started watching from the Widownia (S7-86): „Widz dołączył”, no points. */
export function spectatorToast(
  spectator: { id: string; nickname: string },
  serial: number,
): ToastSlip {
  return {
    id: `spectator:${spectator.id}:${serial}`,
    title: pl.lobbyRoom.spectatorJoined,
    headline: spectator.nickname,
    scoreDelta: null,
    credibilityDelta: 0,
    tone: 'info',
    mark: 'eye',
  };
}

/** Newest first, at most `max` slips. */
export function pushToast(toasts: readonly ToastSlip[], slip: ToastSlip, max: number): ToastSlip[] {
  return [slip, ...toasts].slice(0, max);
}
