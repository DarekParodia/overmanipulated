// Pure helpers behind the HUD: queue order, clock formatting, folder location labels and the
// verdict toast text. Kept free of React so they are unit-tested directly.
import {
  CREDIBILITY as CREDIBILITY_DELTAS,
  DEADLINE_WARNING_MS,
  expiryIsPenalized,
  type Folder,
  type FolderOutcome,
  type Priority,
  SCORE,
  STATION_KINDS,
  type StationKind,
  type StoryType,
  type Truth,
  type Verdict,
} from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { formatNumber } from '../strings/typography.ts';

/** Story facts the HUD needs; a subset of the content `Story`. */
export type StoryInfo = {
  headline: string;
  type: StoryType;
  priority: Priority;
  truth: Truth;
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

export type ToastTone = 'good' | 'caution' | 'bad';

export type ToastSlip = {
  id: string;
  title: string;
  headline: string;
  /** Score delta, or null when the event carries none worth showing. */
  scoreDelta: number | null;
  credibilityDelta: number;
  tone: ToastTone;
  /** Outcome shape (tick, cross, hourglass) so it never depends on colour alone. */
  mark: 'publish' | 'reject' | 'expired';
};

function wrongTitle(verdict: Verdict): string {
  switch (verdict) {
    case 'publish':
      return pl.hud.toast.fakePublished;
    case 'reject':
      return pl.hud.toast.truthRejected;
    case 'publishWithContext':
      return pl.hud.toast.wrong;
  }
}

export function verdictToast(
  event: {
    folderId: string;
    storyId: string;
    verdict: Verdict;
    outcome: FolderOutcome;
    scoreDelta: number;
    credibilityDelta: number;
  },
  story: StoryInfo | undefined,
  serial: number,
): ToastSlip {
  const toneByOutcome: Record<FolderOutcome, ToastTone> = {
    correct: 'good',
    wrongJustification: 'caution',
    wrong: 'bad',
    expired: 'bad',
  };
  const title =
    event.outcome === 'correct'
      ? pl.hud.toast.correct
      : event.outcome === 'wrongJustification'
        ? pl.hud.toast.wrongJustification
        : event.outcome === 'expired'
          ? pl.hud.toast.expired
          : wrongTitle(event.verdict);
  return {
    id: `${event.folderId}:${serial}`,
    title,
    headline: story?.headline ?? pl.hud.untitled,
    scoreDelta: event.scoreDelta,
    credibilityDelta: event.credibilityDelta,
    tone: toneByOutcome[event.outcome],
    mark:
      event.outcome === 'wrong' ? 'reject' : event.outcome === 'expired' ? 'expired' : 'publish',
  };
}

/** `folderExpired` carries no deltas; they follow the scoring table (design doc, Punktacja). */
export function expiredToast(
  event: { folderId: string; storyId: string },
  story: StoryInfo | undefined,
  serial: number,
): ToastSlip {
  const penalized = story ? expiryIsPenalized(story.truth, story.priority) : true;
  return {
    id: `${event.folderId}:${serial}`,
    title: pl.hud.toast.expired,
    headline: story?.headline ?? pl.hud.untitled,
    scoreDelta: penalized ? SCORE.expired : null,
    credibilityDelta: penalized ? CREDIBILITY_DELTAS.expired : 0,
    tone: 'bad',
    mark: 'expired',
  };
}

/** Newest first, at most `max` slips. */
export function pushToast(toasts: readonly ToastSlip[], slip: ToastSlip, max: number): ToastSlip[] {
  return [slip, ...toasts].slice(0, max);
}
