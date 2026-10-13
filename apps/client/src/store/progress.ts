// Campaign progress per browser (S3-04): best stars per level id in localStorage, no accounts.
// Since S7-26 the stars are kept per difficulty (`redakcja.progress.v2`); the v1 store, from
// before difficulties existed, is read once as Normal. The campaign is the levels ordered by
// their number (`l<n>-…`); level 0 is the training level, always open and outside the unlock
// chain. A campaign level opens once the one before it has at least one star on any difficulty;
// the first campaign level is always open.
import { DIFFICULTIES, type Difficulty } from '@redakcja/shared';
import { z } from 'zod';
import { create } from 'zustand';
import { readStored, writeStored } from './safe-storage.ts';

const STORAGE_KEY = 'redakcja.progress.v2';
/** S3-04 storage: one `{levelId: stars}` map, played before difficulties existed (= Normal). */
const LEGACY_STORAGE_KEY = 'redakcja.progress.v1';
/** The difficulty v1 progress was earned on. */
const LEGACY_DIFFICULTY: Difficulty = 'normal';
const MAX_STARS = 3;
/** Stars needed on a level to open the next one. */
const STARS_TO_UNLOCK = 1;

/** Best stars per level id, on one difficulty (or the best across all of them). */
export type LevelStars = Readonly<Record<string, number>>;
/** Best stars per difficulty, then per level id. */
export type Progress = Readonly<Partial<Record<Difficulty, LevelStars>>>;

/** The part of a level the campaign needs (content `Level` fits). */
export type CampaignLevel = { id: string; stations: readonly string[] };

export type CampaignTile<L extends CampaignLevel> = {
  level: L;
  /** 0 for the training level, otherwise the campaign number. */
  number: number;
  training: boolean;
  stars: number;
  unlocked: boolean;
};

const recordSchema = z.record(z.string(), z.unknown());

function parseJson(raw: string | null): unknown {
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Whole, clamped star counts from one `{levelId: stars}` map; anything else is dropped. */
function levelStarsFrom(data: unknown): Record<string, number> {
  const parsed = recordSchema.safeParse(data);
  const out: Record<string, number> = {};
  if (!parsed.success) {
    return out;
  }
  for (const [id, value] of Object.entries(parsed.data)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      out[id] = Math.min(value, MAX_STARS);
    }
  }
  return out;
}

/**
 * Reads stored progress; anything malformed is dropped, never thrown. Without a readable v2
 * store the v1 map (`legacy`) is migrated into Normal.
 */
export function parseProgress(raw: string | null, legacy: string | null = null): Progress {
  const parsed = recordSchema.safeParse(parseJson(raw));
  if (parsed.success) {
    const out: Partial<Record<Difficulty, LevelStars>> = {};
    for (const difficulty of DIFFICULTIES) {
      const stars = levelStarsFrom(parsed.data[difficulty]);
      if (Object.keys(stars).length > 0) {
        out[difficulty] = stars;
      }
    }
    return out;
  }
  const old = levelStarsFrom(parseJson(legacy));
  return Object.keys(old).length > 0 ? { [LEGACY_DIFFICULTY]: old } : {};
}

/** The stars earned on one difficulty. */
export function starsOn(progress: Progress, difficulty: Difficulty): LevelStars {
  return progress[difficulty] ?? {};
}

/** The best stars of every level across all difficulties (what unlocks the campaign). */
export function bestStars(progress: Progress): LevelStars {
  const out: Record<string, number> = {};
  for (const difficulty of DIFFICULTIES) {
    for (const [id, stars] of Object.entries(starsOn(progress, difficulty))) {
      out[id] = Math.max(out[id] ?? 0, stars);
    }
  }
  return out;
}

/** Keeps the best result per difficulty: a worse run never lowers the stars. */
export function withResult(
  progress: Progress,
  difficulty: Difficulty,
  levelId: string,
  stars: number,
): Progress {
  const clamped = Math.max(0, Math.min(MAX_STARS, Math.floor(stars)));
  const current = starsOn(progress, difficulty);
  if ((current[levelId] ?? -1) >= clamped) {
    return progress;
  }
  return { ...progress, [difficulty]: { ...current, [levelId]: clamped } };
}

/** The number in `l<n>-slug`; ids without one sort last. */
export function levelNumber(id: string): number {
  const match = /^l(\d+)-/.exec(id);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Training first, then the campaign in level order. Each tile shows the stars earned on
 * `difficulty`; the locks follow the best stars across every difficulty, so switching to Hard
 * never locks a level the crew already opened on Easy.
 */
export function campaignTiles<L extends CampaignLevel>(
  levels: readonly L[],
  progress: Progress,
  difficulty: Difficulty,
): CampaignTile<L>[] {
  const ordered = [...levels].sort((a, b) => levelNumber(a.id) - levelNumber(b.id));
  const shown = starsOn(progress, difficulty);
  const best = bestStars(progress);
  let previousBest: number | null = null;
  return ordered.map((level) => {
    const number = levelNumber(level.id);
    const training = number === 0;
    const stars = shown[level.id] ?? 0;
    if (training) {
      return { level, number, training, stars, unlocked: true };
    }
    const unlocked = previousBest === null || previousBest >= STARS_TO_UNLOCK;
    previousBest = best[level.id] ?? 0;
    return { level, number, training, stars, unlocked };
  });
}

/**
 * Stations a level brings in for the first time: its stations minus the previous campaign
 * level's. The training level and the first campaign level introduce all of theirs.
 */
export function newStations<S extends string>(
  level: { id: string; stations: readonly S[] },
  levels: readonly CampaignLevel[],
): S[] {
  const number = levelNumber(level.id);
  const previous = [...levels]
    .filter((other) => {
      const n = levelNumber(other.id);
      return n > 0 && n < number;
    })
    .sort((a, b) => levelNumber(b.id) - levelNumber(a.id))[0];
  if (number === 0 || !previous) {
    return [...level.stations];
  }
  const known = new Set(previous.stations);
  return level.stations.filter((station) => !known.has(station));
}

type ProgressStore = {
  best: Progress;
  /** Stores the stars of a finished level if they beat the best so far on that difficulty. */
  record(levelId: string, difficulty: Difficulty, stars: number): void;
};

export const useProgress = create<ProgressStore>((set, get) => ({
  best: parseProgress(readStored('local', STORAGE_KEY), readStored('local', LEGACY_STORAGE_KEY)),
  record(levelId, difficulty, stars) {
    const next = withResult(get().best, difficulty, levelId, stars);
    if (next !== get().best) {
      set({ best: next });
      writeStored('local', STORAGE_KEY, JSON.stringify(next));
    }
  },
}));

// --- Endless mode: best run per difficulty in this browser (S4-11, S7-26) ---------------------

const ENDLESS_KEY = 'redakcja.endless.v2';
/** S4-11 storage: a single best run, played before difficulties existed (= Normal). */
const LEGACY_ENDLESS_KEY = 'redakcja.endless.v1';

export type EndlessRun = { score: number; survivedS: number };
/** The best run on each difficulty. */
export type EndlessBest = Readonly<Partial<Record<Difficulty, EndlessRun>>>;

/** Higher score wins; with equal scores the longer run does. */
export function isBetterRun(candidate: EndlessRun, best: EndlessRun | null | undefined): boolean {
  if (!best) {
    return true;
  }
  return (
    candidate.score > best.score ||
    (candidate.score === best.score && candidate.survivedS > best.survivedS)
  );
}

/** One stored run, or null when it is malformed. */
export function endlessRunFrom(data: unknown): EndlessRun | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const { score, survivedS } = data as Record<string, unknown>;
  if (
    typeof score === 'number' &&
    Number.isInteger(score) &&
    typeof survivedS === 'number' &&
    Number.isInteger(survivedS) &&
    survivedS >= 0
  ) {
    return { score, survivedS };
  }
  return null;
}

/**
 * Reads the stored best runs; anything malformed is dropped, never thrown. Without a readable v2
 * store the single v1 run (`legacy`) is migrated into Normal.
 */
export function parseEndlessBest(raw: string | null, legacy: string | null = null): EndlessBest {
  const parsed = recordSchema.safeParse(parseJson(raw));
  if (parsed.success) {
    const out: Partial<Record<Difficulty, EndlessRun>> = {};
    for (const difficulty of DIFFICULTIES) {
      const run = endlessRunFrom(parsed.data[difficulty]);
      if (run) {
        out[difficulty] = run;
      }
    }
    return out;
  }
  const old = endlessRunFrom(parseJson(legacy));
  return old ? { [LEGACY_DIFFICULTY]: old } : {};
}

/** The best run on one difficulty, or null before the first one. */
export function endlessBestOn(best: EndlessBest, difficulty: Difficulty): EndlessRun | null {
  return best[difficulty] ?? null;
}

type EndlessStore = {
  best: EndlessBest;
  /** Stores a finished run if it beats the best on its difficulty; returns whether it did. */
  record(difficulty: Difficulty, run: EndlessRun): boolean;
};

export const useEndlessBest = create<EndlessStore>((set, get) => ({
  best: parseEndlessBest(readStored('local', ENDLESS_KEY), readStored('local', LEGACY_ENDLESS_KEY)),
  record(difficulty, run) {
    if (!isBetterRun(run, get().best[difficulty])) {
      return false;
    }
    const next: EndlessBest = { ...get().best, [difficulty]: run };
    set({ best: next });
    writeStored('local', ENDLESS_KEY, JSON.stringify(next));
    return true;
  },
}));
