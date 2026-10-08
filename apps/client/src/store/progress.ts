// Campaign progress per browser (S3-04): best stars per level id in localStorage, no accounts.
// The campaign is the levels ordered by their number (`l<n>-…`); level 0 is the training
// level, always open and outside the unlock chain. A campaign level opens once the one before
// it has at least one star; the first campaign level is always open.
import { z } from 'zod';
import { create } from 'zustand';
import { readStored, writeStored } from './safe-storage.ts';

const STORAGE_KEY = 'redakcja.progress.v1';
const MAX_STARS = 3;
/** Stars needed on a level to open the next one. */
const STARS_TO_UNLOCK = 1;

/** Best stars per level id. */
export type Progress = Readonly<Record<string, number>>;

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

const progressSchema = z.record(z.string(), z.unknown());

/** Reads stored progress; anything malformed is dropped, never thrown. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) {
    return {};
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  const parsed = progressSchema.safeParse(data);
  if (!parsed.success) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(parsed.data)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      out[id] = Math.min(value, MAX_STARS);
    }
  }
  return out;
}

/** Keeps the best result: a worse run never lowers the stars. */
export function withResult(progress: Progress, levelId: string, stars: number): Progress {
  const clamped = Math.max(0, Math.min(MAX_STARS, Math.floor(stars)));
  if ((progress[levelId] ?? -1) >= clamped) {
    return progress;
  }
  return { ...progress, [levelId]: clamped };
}

/** The number in `l<n>-slug`; ids without one sort last. */
export function levelNumber(id: string): number {
  const match = /^l(\d+)-/.exec(id);
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/** Training first, then the campaign in level order, with stars and locks. */
export function campaignTiles<L extends CampaignLevel>(
  levels: readonly L[],
  progress: Progress,
): CampaignTile<L>[] {
  const ordered = [...levels].sort((a, b) => levelNumber(a.id) - levelNumber(b.id));
  let previousStars: number | null = null;
  return ordered.map((level) => {
    const number = levelNumber(level.id);
    const training = number === 0;
    const stars = progress[level.id] ?? 0;
    if (training) {
      return { level, number, training, stars, unlocked: true };
    }
    const unlocked = previousStars === null || previousStars >= STARS_TO_UNLOCK;
    previousStars = stars;
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
  /** Stores the stars of a finished level if they beat the best so far. */
  record(levelId: string, stars: number): void;
};

export const useProgress = create<ProgressStore>((set, get) => ({
  best: parseProgress(readStored('local', STORAGE_KEY)),
  record(levelId, stars) {
    const next = withResult(get().best, levelId, stars);
    if (next !== get().best) {
      set({ best: next });
      writeStored('local', STORAGE_KEY, JSON.stringify(next));
    }
  },
}));
