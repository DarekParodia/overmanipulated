// What the lobby's „Szczegóły” sheet says about a level (S7-87), for guests and the host alike:
// its stations and events, how long it lasts and how many folders it deals, the star rule and the
// rule of the mode. Pure: the sheet renders the result with the station help and event strings.
//
// Stars are worded as shares of the run's maximum score (`STAR_SHARES`, or the level's
// `bag.starShares`), because a bag level deals a new run with new thresholds every time
// (S7-20); the points are shown only when they are known: the dealt run's (`roomState.run`), or
// an authored level's fixed `stars`.
import type { BagTiming, Level } from '@redakcja/content';
import {
  type Difficulty,
  ENDLESS_LEVEL_ID,
  type LevelEventKind,
  type RoomMode,
  type RunSummary,
  STAR_SHARES,
  type StarThresholds,
  type StationKind,
  VERSUS,
} from '@redakcja/shared';
import { levelCardFolders } from './level-card-model.ts';

/** The level fields the details read (a resolved level, or the endless preview). */
export type DetailsLevel = Pick<Level, 'id' | 'durationS' | 'stations' | 'events' | 'schedule'> & {
  stars?: StarThresholds | undefined;
  bag?: (BagTiming & Pick<NonNullable<Level['bag']>, 'pool' | 'starShares'>) | undefined;
};

/** The star rule: one star for a positive score, two and three from a share of the maximum. */
export type StarRule = {
  /**
   * Whole percent of the run's maximum score for two and three stars (a bag level); null for an
   * authored level, whose fixed points say it.
   */
  sharePercent: { two: number; three: number } | null;
  /** The thresholds in points when they are known (a dealt run, an authored level), else null. */
  points: StarThresholds | null;
};

/** The rule line under the stars: who wins a versus match, or how long the run lasts. */
export type ModeRule = 'versus' | 'versusEndless' | 'endless' | null;

export type LevelDetails = {
  endless: boolean;
  /** Minutes the run lasts; null for co-op endless (it ends at zero credibility). */
  minutes: number | null;
  /** Folders the run deals (the dealt run's, else what the difficulty deals); null in endless. */
  folders: number | null;
  /** Stories the bag draws from; null for an authored schedule and in endless. */
  poolSize: number | null;
  stations: StationKind[];
  /** Event kinds the level may bring, each once, in the order they first come. */
  events: LevelEventKind[];
  /** Null in endless (no stars). */
  stars: StarRule | null;
  rule: ModeRule;
};

/** A share of the maximum score as a whole percent (0.55 → 55). */
export function sharePercent(share: number): number {
  return Math.round(share * 100);
}

/**
 * The details of `level` for a room in `mode` on `difficulty`. `run` is `roomState.run`: the run
 * dealt at the briefing (null in the lobby, where nothing is dealt yet).
 */
export function levelDetails(
  level: DetailsLevel,
  mode: RoomMode,
  difficulty: Difficulty,
  run: Pick<RunSummary, 'folders' | 'stars'> | null,
): LevelDetails {
  const endless = level.id === ENDLESS_LEVEL_ID;
  const versus = mode === 'versus';
  const events = [...new Set(level.events.map((event) => event.kind))];
  if (endless) {
    return {
      endless,
      minutes: versus ? Math.round(VERSUS.endlessDurationS / 60) : null,
      folders: null,
      poolSize: null,
      stations: [...level.stations],
      events,
      stars: null,
      rule: versus ? 'versusEndless' : 'endless',
    };
  }
  const shares = level.bag ? (level.bag.starShares ?? STAR_SHARES) : null;
  const points = run?.stars ?? (level.bag ? null : (level.stars ?? null));
  return {
    endless,
    minutes: Math.round(level.durationS / 60),
    folders: levelCardFolders(level, difficulty, run?.folders ?? null),
    poolSize: level.bag ? level.bag.pool.length : null,
    stations: [...level.stations],
    events,
    stars: {
      sharePercent: shares && {
        two: sharePercent(shares.two),
        three: sharePercent(shares.three),
      },
      points,
    },
    rule: versus ? 'versus' : null,
  };
}
