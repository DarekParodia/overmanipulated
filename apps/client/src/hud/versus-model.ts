// Pure model behind the versus HUD and results (S7-89): who leads, when the lead change is worth
// a cue, how the match ended from this newsroom's side, and which of the rival's folders matches
// each of ours. Rival folders pair by `spawnKey` (the same in both newsrooms), never by folder id:
// the ids drift apart as soon as one belt holds a raid wave back. Free of React, so it is
// unit-tested directly.
import {
  type FolderResult,
  type TeamIndex,
  type TeamScore,
  VERSUS,
  type VersusSummary,
} from '@redakcja/shared';

// --- Lead -------------------------------------------------------------------------------------

export type LeadState = 'ahead' | 'behind' | 'tied';

/** This newsroom's place against the rival, by points. */
export function leadState(own: number, rival: number): LeadState {
  if (own > rival) {
    return 'ahead';
  }
  return own < rival ? 'behind' : 'tied';
}

export type LeadCue = 'versus.leadTaken' | 'versus.leadLost';

/**
 * The cue for a change of lead: taking it (from behind or a tie) or losing it (from ahead or a
 * tie). Falling back to a tie is no news. At most one cue per `VERSUS.leadCueCooldownMs`, so a
 * tight match does not chime on every folder; `lastCueAtMs` null means no cue played yet.
 */
export function leadCue(
  previous: LeadState,
  next: LeadState,
  lastCueAtMs: number | null,
  nowMs: number,
): LeadCue | null {
  if (next === previous || next === 'tied') {
    return null;
  }
  if (lastCueAtMs !== null && nowMs - lastCueAtMs < VERSUS.leadCueCooldownMs) {
    return null;
  }
  return next === 'ahead' ? 'versus.leadTaken' : 'versus.leadLost';
}

/** Both newsrooms' standings from this newsroom's side. */
export type Standings = { own: TeamScore; rival: TeamScore; lead: LeadState };

/** Null outside versus (no scoreboard) or while a newsroom is missing from it. */
export function standingsOf(
  scoreboard: readonly TeamScore[] | null,
  ownTeam: TeamIndex,
): Standings | null {
  const own = scoreboard?.find((team) => team.team === ownTeam);
  const rival = scoreboard?.find((team) => team.team !== ownTeam);
  if (!own || !rival) {
    return null;
  }
  return { own, rival, lead: leadState(own.score, rival.score) };
}

// --- Match result -----------------------------------------------------------------------------

export type VersusResultKind = 'win' | 'lose' | 'draw';

/** The ribbon's reason line, from this newsroom's side (`pl.versus.reasons`). */
export type VersusReasonId =
  | 'score'
  | 'rivalScore'
  | 'rivalCredibility'
  | 'ownCredibility'
  | 'rivalForfeit'
  | 'ownForfeit'
  | 'draw';

export type VersusVerdict = { result: VersusResultKind; reason: VersusReasonId };

/** How the match ended for `ownTeam`: won, lost or drawn, and why. */
export function versusVerdict(
  summary: Pick<VersusSummary, 'winnerTeam' | 'reason'>,
  ownTeam: TeamIndex,
): VersusVerdict {
  if (summary.winnerTeam === null) {
    return { result: 'draw', reason: 'draw' };
  }
  const won = summary.winnerTeam === ownTeam;
  switch (summary.reason) {
    case 'credibility':
      return won
        ? { result: 'win', reason: 'rivalCredibility' }
        : { result: 'lose', reason: 'ownCredibility' };
    case 'forfeit':
      return won
        ? { result: 'win', reason: 'rivalForfeit' }
        : { result: 'lose', reason: 'ownForfeit' };
    default:
      return won ? { result: 'win', reason: 'score' } : { result: 'lose', reason: 'rivalScore' };
  }
}

/** The two team cards: this newsroom first, then the rival; null while one is missing. */
export function teamCardsOf(
  teams: readonly TeamScore[],
  ownTeam: TeamIndex,
): { own: TeamScore; rival: TeamScore } | null {
  const standings = standingsOf(teams, ownTeam);
  return standings ? { own: standings.own, rival: standings.rival } : null;
}

// --- Rival folders ----------------------------------------------------------------------------

/**
 * The rival's result for each of our folders, in our order: matched by `spawnKey`, null for a
 * folder the rival never got (a raid wave its fuller belt cut short). Rival folders we never got
 * are left out; with two results under one key (never sent today) the first one counts.
 */
export function pairRivalResults(
  own: readonly { spawnKey: string }[],
  rivalResults: readonly FolderResult[],
): (FolderResult | null)[] {
  const byKey = new Map<string, FolderResult>();
  for (const result of rivalResults) {
    if (!byKey.has(result.spawnKey)) {
      byKey.set(result.spawnKey, result);
    }
  }
  return own.map((folder) => byKey.get(folder.spawnKey) ?? null);
}
