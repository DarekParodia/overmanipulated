// Pure model behind the results screen (S7-05): what the points were for (totals rows), how far
// the next star is, why a level was lost, the Kolegium cards (one per folder, or one per story
// in endless) and the timing of the step-by-step reveal. Free of React and of the content
// module so it is unit-tested directly.
import {
  type FolderOutcome,
  type FolderResult,
  isHintOnly,
  type LevelEndMessage,
  type LossReason,
  type StarThresholds,
  type StationKind,
} from '@redakcja/shared';
import type {
  DebriefCard,
  DebriefStory,
  DebriefStoryLookup,
  ProofRow,
  ProofStatus,
} from './debrief-model.ts';

// --- Totals ('Za co punkty') ----------------------------------------------------------------

/**
 * One row of the totals table: outcome rows carry the base points and the credibility, bonus
 * rows (`speed`, `proofs` = multi-stamp, `bossCall`) carry bonus points only, and `other` carries
 * the points of results the server no longer sent (endless runs cap them).
 */
export type TotalsRowId =
  | 'correct'
  | 'correction'
  | 'speed'
  | 'proofs'
  | 'bossCall'
  | 'weakProof'
  | 'wrong'
  | 'expired'
  | 'unfinished'
  | 'other';

export type TotalsRow = {
  id: TotalsRowId;
  /** Folders in the row; 0 for `other` (the missing results are unknown). */
  count: number;
  points: number;
  credibility: number;
};

export type ResultTotals = { rows: TotalsRow[]; points: number; credibility: number };

/** Row order of the table: rewards first, then the losses. */
const ROW_ORDER: readonly TotalsRowId[] = [
  'correct',
  'correction',
  'speed',
  'proofs',
  'bossCall',
  'weakProof',
  'wrong',
  'expired',
  'unfinished',
  'other',
];

const OUTCOME_ROW = {
  correct: 'correct',
  wrongJustification: 'weakProof',
  wrong: 'wrong',
  expired: 'expired',
  unfinished: 'unfinished',
} as const satisfies Record<FolderOutcome, TotalsRowId>;

function outcomeRow(result: FolderResult): TotalsRowId {
  return result.reason === 'correctionFiled' ? 'correction' : OUTCOME_ROW[result.outcome];
}

/**
 * Totals of a level's results. The base points (`scoreDelta − Σ bonuses`) and the credibility go
 * to the outcome row; each bonus goes to its own row and counts a folder only when it is above 0.
 * Rows without folders are left out, so Σ rows.points = Σ scoreDelta. With `levelScore` (the
 * level's final score) a difference, from results the server capped, becomes an `other` row.
 */
export function resultTotals(results: readonly FolderResult[], levelScore?: number): ResultTotals {
  const rows = new Map<TotalsRowId, TotalsRow>();
  const add = (id: TotalsRowId, points: number, credibility: number) => {
    const row = rows.get(id) ?? { id, count: 0, points: 0, credibility: 0 };
    row.count += 1;
    row.points += points;
    row.credibility += credibility;
    rows.set(id, row);
  };
  for (const result of results) {
    const { speed, multiStamp, bossCall } = result.bonuses;
    add(
      outcomeRow(result),
      result.scoreDelta - speed - multiStamp - bossCall,
      result.credibilityDelta,
    );
    if (speed > 0) {
      add('speed', speed, 0);
    }
    if (multiStamp > 0) {
      add('proofs', multiStamp, 0);
    }
    if (bossCall > 0) {
      add('bossCall', bossCall, 0);
    }
  }
  const sum = results.reduce((total, result) => total + result.scoreDelta, 0);
  if (levelScore !== undefined && levelScore !== sum) {
    rows.set('other', { id: 'other', count: 0, points: levelScore - sum, credibility: 0 });
  }
  const ordered = ROW_ORDER.flatMap((id) => {
    const row = rows.get(id);
    return row ? [row] : [];
  });
  return {
    rows: ordered,
    points: ordered.reduce((total, row) => total + row.points, 0),
    credibility: ordered.reduce((total, row) => total + row.credibility, 0),
  };
}

// --- Star progress --------------------------------------------------------------------------

export type EarnedStars = 0 | 1 | 2 | 3;

export type StarProgress = {
  earned: EarnedStars;
  won: boolean;
  thresholds: StarThresholds;
  /** The next star and the points still missing; null with three stars or a lost level. */
  next: { stars: 2 | 3; missing: number } | null;
  /** Thresholds as whole percent of the level's best possible score; null without it. */
  shares: { two: number; three: number } | null;
};

const EARNED: readonly EarnedStars[] = [0, 1, 2, 3];

function earnedStars(stars: number): EarnedStars {
  return EARNED[Math.max(0, Math.min(EARNED.length - 1, Math.trunc(stars)))] ?? 0;
}

/**
 * How far the next star is. Only a won level earns stars (one for a positive score at time-out),
 * so a lost level has no next star; otherwise it is the lowest threshold above the score.
 */
export function starProgress(
  score: number,
  won: boolean,
  earned: number,
  thresholds: StarThresholds,
  maxScore: number | null,
): StarProgress {
  let next: StarProgress['next'] = null;
  if (won && score < thresholds.two) {
    next = { stars: 2, missing: thresholds.two - score };
  } else if (won && score < thresholds.three) {
    next = { stars: 3, missing: thresholds.three - score };
  }
  const shares =
    maxScore !== null && maxScore > 0
      ? {
          two: Math.round((thresholds.two / maxScore) * 100),
          three: Math.round((thresholds.three / maxScore) * 100),
        }
      : null;
  return { earned: earnedStars(earned), won, thresholds, next, shares };
}

// --- Loss reason ----------------------------------------------------------------------------

export type LossReasonInput = Pick<LevelEndMessage, 'won' | 'credibility'> & {
  lossReason?: LossReason | null | undefined;
};

/**
 * Why the level was lost (null when won). Takes the server's reason; without one, an empty
 * credibility bar is the reason, and otherwise the score.
 */
export function lossReasonOf(end: LossReasonInput): LossReason | null {
  if (end.won) {
    return null;
  }
  if (end.lossReason) {
    return end.lossReason;
  }
  return end.credibility <= 0 ? 'credibility' : 'score';
}

// --- Kolegium cards -------------------------------------------------------------------------

export type KolegiumCard = DebriefCard & {
  credibilityDelta: number;
  bonuses: FolderResult['bonuses'];
  /** Proofs the story required (`requiredStamps`) and the countable ones the desk cited. */
  requiredStamps: number;
  citedProofs: number;
  /** Stations of the hint-only stamps (the AI scanner) cited without any proof; else []. */
  hintStations: StationKind[];
  /** Folders on the card: 1 per folder, more for a story grouped in endless. */
  count: number;
  /** Folders on the card per outcome; with `count` 1 only the card's own outcome. */
  tally: Record<FolderOutcome, number>;
};

/** `folder`: one card per folder (campaign, versus); `story`: one per story (endless). */
export type KolegiumMode = 'folder' | 'story';

const NO_TALLY: Readonly<Record<FolderOutcome, number>> = {
  correct: 0,
  wrongJustification: 0,
  wrong: 0,
  expired: 0,
  unfinished: 0,
};

/** Folder ids are `f<n>` in spawn order; anything else sorts after them, in list order. */
function arrivalNumber(folderId: string): number {
  const match = /^f(\d+)$/.exec(folderId);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/**
 * 'Dowód, który rozstrzygał' for a folder that did not end `correct`: each justifying, non-hint
 * stamp in the story's order, cited at the desk ('wskazany'), only in the folder ('w teczce') or
 * never collected ('nie sprawdzono'). A stamp from a station missing on the level could not be
 * collected, so it is left out. Null for a correct folder.
 */
function proofRows(
  result: FolderResult,
  story: DebriefStory | undefined,
  levelStations: readonly StationKind[],
): ProofRow[] | null {
  if (result.outcome === 'correct') {
    return null;
  }
  const justifying = story?.justifyingStamps ?? [
    ...result.justifyingStampIds,
    ...result.missedStampIds,
  ];
  return (story?.stamps ?? []).flatMap((stamp): ProofRow[] => {
    if (!justifying.includes(stamp.id) || isHintOnly(stamp.station)) {
      return [];
    }
    const status: ProofStatus = result.missedStampIds.includes(stamp.id)
      ? 'missing'
      : result.justifyingStampIds.includes(stamp.id)
        ? 'cited'
        : 'collected';
    if (
      status === 'missing' &&
      levelStations.length > 0 &&
      !levelStations.includes(stamp.station)
    ) {
      return [];
    }
    return [{ id: stamp.id, station: stamp.station, text: stamp.text, status }];
  });
}

function cardOf(
  result: FolderResult,
  lookup: DebriefStoryLookup,
  levelStations: readonly StationKind[],
): KolegiumCard {
  const story = lookup(result.storyId);
  const stamps = story?.stamps ?? [];
  const stationOf = (id: string) => stamps.find((s) => s.id === id)?.station;
  const cited = [...new Set(result.justifyingStampIds)];
  const hints = [
    ...new Set(
      cited.flatMap((id) => {
        const station = stationOf(id);
        return station !== undefined && isHintOnly(station) ? [station] : [];
      }),
    ),
  ];
  const citedProofs = cited.filter((id) => {
    const station = stationOf(id);
    const justifies = story?.justifyingStamps?.includes(id) ?? true;
    const inFolder = !result.missedStampIds.includes(id);
    return station !== undefined && justifies && inFolder && !isHintOnly(station);
  }).length;
  return {
    storyId: result.storyId,
    folderId: result.folderId,
    headline: story?.headline ?? null,
    outcome: result.outcome,
    reason: result.reason,
    verdict: result.verdict,
    correctVerdict: story?.correctVerdict ?? null,
    scoreDelta: result.scoreDelta,
    credibilityDelta: result.credibilityDelta,
    bonuses: { ...result.bonuses },
    requiredStamps: result.requiredStamps,
    citedProofs,
    hintStations: citedProofs === 0 ? hints : [],
    count: 1,
    tally: { ...NO_TALLY, [result.outcome]: 1 },
    debrief: story?.debrief ?? null,
    proof: proofRows(result, story, levelStations),
  };
}

/**
 * The Kolegium cards in the order the folders arrived (results come in resolution order), with
 * the folders still in play at the end (`unfinished`) last. Per folder, the card points add up
 * to the level's score. Per story, a story that came again adds its points, credibility, bonuses
 * and outcome to the story's card (`count`, `tally`); the card keeps the first folder's outcome,
 * reason and verdict, and the deciding proof of the first folder that needed it, so the list
 * stays short in long runs. `levelStations` (the level's station kinds; empty: unknown) leaves
 * proof from stations the level does not have out of the proof section.
 */
export function kolegiumCards(
  results: readonly FolderResult[],
  lookup: DebriefStoryLookup,
  mode: KolegiumMode,
  levelStations: readonly StationKind[] = [],
): KolegiumCard[] {
  const last = (result: FolderResult) => (result.outcome === 'unfinished' ? 1 : 0);
  const ordered = results
    .map((result, index) => ({ result, index }))
    .sort(
      (a, b) =>
        last(a.result) - last(b.result) ||
        arrivalNumber(a.result.folderId) - arrivalNumber(b.result.folderId) ||
        a.index - b.index,
    );
  if (mode === 'folder') {
    return ordered.map(({ result }) => cardOf(result, lookup, levelStations));
  }
  const byStory = new Map<string, KolegiumCard>();
  for (const { result } of ordered) {
    const card = byStory.get(result.storyId);
    if (!card) {
      byStory.set(result.storyId, cardOf(result, lookup, levelStations));
      continue;
    }
    card.count += 1;
    card.tally[result.outcome] += 1;
    card.scoreDelta += result.scoreDelta;
    card.credibilityDelta += result.credibilityDelta;
    card.bonuses.speed += result.bonuses.speed;
    card.bonuses.multiStamp += result.bonuses.multiStamp;
    card.bonuses.bossCall += result.bonuses.bossCall;
    if (card.proof === null) {
      card.proof = proofRows(result, lookup(result.storyId), levelStations);
    }
  }
  // Insertion order: a story first met among the unfinished folders stays with them, last.
  return [...byStory.values()];
}

// --- Reveal plan ----------------------------------------------------------------------------

/** Waits for the panel's pop-in before the first step. */
export const REVEAL_START_MS = 520;
export const REVEAL_STAR_MS = 420;
/** Breath after the stars and after the totals rows. */
export const REVEAL_PAUSE_MS = 260;
/** The points-to-next-star line, before the first totals row. */
export const REVEAL_PROGRESS_MS = 300;
export const REVEAL_ROW_MS = 140;
export const REVEAL_MARK_MS = 380;

export type RevealStepKind = 'star' | 'progress' | 'row' | 'mark';
/** One reveal step: when (ms after mount), what, and its index among the steps of its kind. */
export type RevealStep = { atMs: number; kind: RevealStepKind; index: number };

/**
 * The results reveal: stars, the progress line, the totals rows, then the Kolegium marks. Each
 * star takes `REVEAL_STAR_MS` and the stars are followed by a pause; the progress line takes
 * `REVEAL_PROGRESS_MS`; rows tick every `REVEAL_ROW_MS` and the last one is followed by a pause;
 * marks slam every `REVEAL_MARK_MS`. `progress: false` leaves out the progress line (endless has
 * no stars to progress to).
 */
export function revealPlan(p: {
  stars: number;
  rows: number;
  marks: number;
  progress?: boolean;
}): RevealStep[] {
  const steps: RevealStep[] = [];
  let at = REVEAL_START_MS;
  for (let i = 0; i < p.stars; i++) {
    steps.push({ atMs: at, kind: 'star', index: i });
    at += REVEAL_STAR_MS;
  }
  if (p.stars > 0) {
    at += REVEAL_PAUSE_MS;
  }
  if (p.progress ?? true) {
    steps.push({ atMs: at, kind: 'progress', index: 0 });
    at += REVEAL_PROGRESS_MS;
  }
  for (let i = 0; i < p.rows; i++) {
    steps.push({ atMs: at + i * REVEAL_ROW_MS, kind: 'row', index: i });
  }
  if (p.rows > 0) {
    at += (p.rows - 1) * REVEAL_ROW_MS + REVEAL_PAUSE_MS;
  }
  for (let i = 0; i < p.marks; i++) {
    steps.push({ atMs: at + i * REVEAL_MARK_MS, kind: 'mark', index: i });
  }
  return steps;
}

/** How many steps of each kind a reveal has shown, given how many steps it has shown in all. */
export function revealedByKind(
  plan: readonly RevealStep[],
  revealed: number,
): Record<RevealStepKind, number> {
  const shown: Record<RevealStepKind, number> = { star: 0, progress: 0, row: 0, mark: 0 };
  for (const step of plan.slice(0, Math.max(0, revealed))) {
    shown[step.kind] += 1;
  }
  return shown;
}
