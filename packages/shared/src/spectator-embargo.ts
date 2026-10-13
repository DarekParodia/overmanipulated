// The versus spectator embargo (S7-78), pure: the spectator topic must never carry a verdict,
// outcome, reason or points for a spawn key until every newsroom has closed that key (verdict or
// expiry) or the level ended. Until then a closing event goes out as `verdictMasked` and its
// result is held; `release` hands the held results over as `verdictRevealed` once the key is
// closed everywhere, `releaseAll` at level end. In co-op (one team) events pass through.
// The server keeps one embargo per room and feeds it every team's events (S7-81).
import type { FolderResult } from './entities.ts';
import type { GameEvent, SpectatorEvent, TeamIndex } from './protocol.ts';

export type VerdictRevealedEvent = Extract<SpectatorEvent, { kind: 'verdictRevealed' }>;
export type VerdictMaskedEvent = Extract<SpectatorEvent, { kind: 'verdictMasked' }>;

/** A result waiting for the rival newsroom, ready to go out as a `spectatorEvent`. */
export type HeldResult = { team: TeamIndex; event: VerdictRevealedEvent };

export type SpectatorEmbargo = {
  /** Newsrooms in the match; with one (co-op) nothing is held. */
  teams: number;
  /** Per spawn key: the teams that have it in play (spawned, not yet closed). */
  open: Readonly<Record<string, readonly TeamIndex[]>>;
  /** Per spawn key: the teams that have closed it. */
  closed: Readonly<Record<string, readonly TeamIndex[]>>;
  /** Results not yet revealed, in the order they were closed. */
  held: readonly HeldResult[];
};

export function createEmbargo(teams: number): SpectatorEmbargo {
  return { teams, open: {}, closed: {}, held: [] };
}

/** The key is in play for `team` (the server calls it when the folder spawns). */
export function openSpawnKey(
  embargo: SpectatorEmbargo,
  team: TeamIndex,
  spawnKey: string,
): SpectatorEmbargo {
  if (embargo.closed[spawnKey]?.includes(team) || embargo.open[spawnKey]?.includes(team)) {
    return embargo;
  }
  return { ...embargo, open: withTeam(embargo.open, spawnKey, team) };
}

/** `team` closed the key (verdict or expiry); a botRaid wave closes it once per folder. */
export function closeSpawnKey(
  embargo: SpectatorEmbargo,
  team: TeamIndex,
  spawnKey: string,
): SpectatorEmbargo {
  const open = withoutTeam(embargo.open, spawnKey, team);
  if (embargo.closed[spawnKey]?.includes(team)) {
    return open === embargo.open ? embargo : { ...embargo, open };
  }
  return { ...embargo, open, closed: withTeam(embargo.closed, spawnKey, team) };
}

/** True once every newsroom of the match has closed the key. */
export function closedEverywhere(embargo: SpectatorEmbargo, spawnKey: string): boolean {
  return (embargo.closed[spawnKey]?.length ?? 0) >= embargo.teams;
}

/**
 * What the spectator topic may carry for one of `team`'s events. In versus a `verdictResult`
 * or `folderExpired` closes its key, holds the result and goes out as `verdictMasked`; call
 * `release` for the key afterwards. An expiry's result is not on its event, so it is looked up
 * by folder id in `results` (the team's results after the step); a botRaid sibling has none
 * (the wave is one result) and holds nothing. Every other event passes through unchanged.
 */
export function maskForSpectators(
  embargo: SpectatorEmbargo,
  team: TeamIndex,
  event: GameEvent,
  results: readonly FolderResult[] = [],
): { embargo: SpectatorEmbargo; event: SpectatorEvent } {
  if (embargo.teams <= 1) {
    return { embargo, event };
  }
  if (event.kind === 'verdictResult') {
    const { kind: _kind, playerId, ...result } = event;
    const closed = closeSpawnKey(embargo, team, event.spawnKey);
    return {
      embargo: hold(closed, team, { ...result, playerId }),
      event: masked(playerId, event.folderId, event.spawnKey, 'verdict'),
    };
  }
  if (event.kind === 'folderExpired') {
    const closed = closeSpawnKey(embargo, team, event.spawnKey);
    const result = results.find(
      (candidate) => candidate.folderId === event.folderId && candidate.outcome === 'expired',
    );
    return {
      embargo: result ? hold(closed, team, { ...result, playerId: null }) : closed,
      event: masked(null, event.folderId, event.spawnKey, 'expired'),
    };
  }
  return { embargo, event };
}

/** The key's held results once every newsroom closed it, removed from the embargo; else none. */
export function release(
  embargo: SpectatorEmbargo,
  spawnKey: string,
): { embargo: SpectatorEmbargo; revealed: HeldResult[] } {
  if (!closedEverywhere(embargo, spawnKey)) {
    return { embargo, revealed: [] };
  }
  const revealed = embargo.held.filter((held) => held.event.result.spawnKey === spawnKey);
  if (revealed.length === 0) {
    return { embargo, revealed };
  }
  const held = embargo.held.filter((entry) => entry.event.result.spawnKey !== spawnKey);
  return { embargo: { ...embargo, held }, revealed };
}

/** Level end: every held result, in closing order, and a fresh embargo. */
export function releaseAll(embargo: SpectatorEmbargo): {
  embargo: SpectatorEmbargo;
  revealed: HeldResult[];
} {
  return { embargo: createEmbargo(embargo.teams), revealed: [...embargo.held] };
}

function hold(
  embargo: SpectatorEmbargo,
  team: TeamIndex,
  result: VerdictRevealedEvent['result'],
): SpectatorEmbargo {
  const entry: HeldResult = { team, event: { kind: 'verdictRevealed', result } };
  return { ...embargo, held: [...embargo.held, entry] };
}

function masked(
  playerId: string | null,
  folderId: string,
  spawnKey: string,
  closedBy: VerdictMaskedEvent['closedBy'],
): VerdictMaskedEvent {
  return { kind: 'verdictMasked', playerId, folderId, spawnKey, closedBy };
}

function withTeam(
  map: Readonly<Record<string, readonly TeamIndex[]>>,
  spawnKey: string,
  team: TeamIndex,
): Readonly<Record<string, readonly TeamIndex[]>> {
  return { ...map, [spawnKey]: [...(map[spawnKey] ?? []), team] };
}

function withoutTeam(
  map: Readonly<Record<string, readonly TeamIndex[]>>,
  spawnKey: string,
  team: TeamIndex,
): Readonly<Record<string, readonly TeamIndex[]>> {
  const teams = map[spawnKey];
  if (!teams?.includes(team)) {
    return map;
  }
  const rest = teams.filter((entry) => entry !== team);
  if (rest.length > 0) {
    return { ...map, [spawnKey]: rest };
  }
  const { [spawnKey]: _removed, ...others } = map;
  return others;
}
