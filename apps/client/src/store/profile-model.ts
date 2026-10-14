// The player's local profile (S7-104): lifetime counters, the favourite role and the preferred
// look, kept per browser under `redakcja.profile.v1`, with no account. Pure: the counters of one
// match come from the shared match-stats accumulator (`applyStatsEvent`, S7-78), the same one the
// server folds for spectators and `levelEnd.stats`, so a counter is never defined twice. The look
// (colour, accessory) is only a preference for now; S7-105 sends it with the join.
import {
  applyStatsEvent,
  emptyPlayerStats,
  type GameEvent,
  type LevelEndMessage,
  PLAYER_COLOR_COUNT,
  type PlayerStats,
  ROLES,
  type Role,
  roleSchema,
  type TeamIndex,
} from '@redakcja/shared';
import { z } from 'zod';

/** The cosmetic a player can wear (glossary: Dodatek); S7-105 moves it onto the wire. */
export const ACCESSORIES = ['none', 'scarf', 'bowTie', 'pressCard'] as const;
export type Accessory = (typeof ACCESSORIES)[number];

const count = z.number().int().nonnegative().catch(0);

/** Every field falls back on its own, so one bad value never wipes the rest of the profile. */
export const profileSchema = z.object({
  /** Levels played to their end (Rozegrane wydania). */
  levels: count,
  wins: count,
  verdicts: count,
  correct: count,
  wrong: count,
  stamps: count,
  minigameFails: count,
  abilities: count,
  /** Levels played to their end per role (Ulubiona rola). */
  roleLevels: z.partialRecord(roleSchema, count).catch({}),
  /** The preferred player colour; null lets the room pick. */
  color: z
    .number()
    .int()
    .min(0)
    .max(PLAYER_COLOR_COUNT - 1)
    .nullable()
    .catch(null),
  accessory: z.enum(ACCESSORIES).catch('none'),
});

export type Profile = z.infer<typeof profileSchema>;

/** The match counters a profile adds up (every `PlayerStats` counter). */
type Counters = Pick<
  PlayerStats,
  'verdicts' | 'correct' | 'wrong' | 'stamps' | 'minigameFails' | 'abilities'
>;

export function emptyProfile(): Profile {
  return profileSchema.parse({});
}

/** Reads a stored profile; anything malformed falls back field by field, never throws. */
export function parseProfile(raw: string | null): Profile {
  let data: unknown = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
  }
  const parsed = profileSchema.safeParse(data);
  return parsed.success ? parsed.data : emptyProfile();
}

/** The local player's seat in the match; null for a spectator or outside a room. */
export type Seat = { playerId: string; team: TeamIndex; role: Role | null };

/**
 * Folds one gameplay event into the running tally of the match. The tally starts on the first
 * event and starts over when it belongs to someone else (a new seat after a rejoin); a spectator
 * (`seat` null) keeps none.
 */
export function withEvent(
  tally: PlayerStats | null,
  event: GameEvent,
  seat: Seat | null,
): PlayerStats | null {
  if (!seat) {
    return null;
  }
  const current =
    tally && tally.playerId === seat.playerId ? tally : emptyPlayerStats(seat.playerId, seat.team);
  return applyStatsEvent(current, event);
}

/**
 * Adds a finished level to the profile: one more level (and win), the role it was played in and
 * the match counters. The server's `levelEnd.stats` win when they carry this player (they also
 * count what happened while this tab was reconnecting); else the local tally does.
 */
export function withLevelEnd(
  profile: Profile,
  end: Pick<LevelEndMessage, 'won' | 'stats'>,
  seat: Seat,
  tally: PlayerStats | null,
): Profile {
  const counters: Counters | null =
    end.stats?.find((stats) => stats.playerId === seat.playerId) ??
    (tally?.playerId === seat.playerId ? tally : null);
  const roleLevels = seat.role
    ? { ...profile.roleLevels, [seat.role]: (profile.roleLevels[seat.role] ?? 0) + 1 }
    : profile.roleLevels;
  return {
    ...profile,
    levels: profile.levels + 1,
    wins: profile.wins + (end.won ? 1 : 0),
    verdicts: profile.verdicts + (counters?.verdicts ?? 0),
    correct: profile.correct + (counters?.correct ?? 0),
    wrong: profile.wrong + (counters?.wrong ?? 0),
    stamps: profile.stamps + (counters?.stamps ?? 0),
    minigameFails: profile.minigameFails + (counters?.minigameFails ?? 0),
    abilities: profile.abilities + (counters?.abilities ?? 0),
    roleLevels,
  };
}

/** The share of verdicts that were correct, as a whole percent; null before the first verdict. */
export function accuracy(profile: Pick<Profile, 'verdicts' | 'correct'>): number | null {
  if (profile.verdicts === 0) {
    return null;
  }
  return Math.round((profile.correct * 100) / profile.verdicts);
}

/** The role with the most finished levels; a tie goes to the earlier role in `ROLES`. */
export function favouriteRole(profile: Pick<Profile, 'roleLevels'>): Role | null {
  let best: Role | null = null;
  let bestLevels = 0;
  for (const role of ROLES) {
    const levels = profile.roleLevels[role] ?? 0;
    if (levels > bestLevels) {
      best = role;
      bestLevels = levels;
    }
  }
  return best;
}

/** The profile with its statistics cleared; the look stays. */
export function withoutStats(profile: Profile): Profile {
  return { ...emptyProfile(), color: profile.color, accessory: profile.accessory };
}
