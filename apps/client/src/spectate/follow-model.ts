// Following a player on the spectate screen (S7-91), pure: the order ←/→ (RB, a chip tap) walks
// through, which newsroom must be on screen for the followed player, and what the FollowCard says
// about them. The card never tells an answer: the folder's headline and its stamps as station
// icons only, never a stamp's text, the story's truth or a verdict.
import type { Desk, Folder, LobbyPlayer, Station, StationKind, TeamIndex } from '@redakcja/shared';
import { type SpectateFocus, type SpectateLayout, visibleTeams } from './spectate-layout.ts';

type SpectateTeams = readonly TeamIndex[];

/** The players one can follow: Kurier's in join order, then Głos's. */
export function followOrder(
  roster: readonly LobbyPlayer[],
  teams: SpectateTeams,
): readonly LobbyPlayer[] {
  return teams.flatMap((team) => roster.filter((player) => player.team === team));
}

/**
 * The player after (`step` 1) or before (−1) `current` in `order`, wrapping round; with nobody
 * followed (or a player no longer there) ← starts from the last and → from the first.
 */
export function stepFollow(
  order: readonly LobbyPlayer[],
  current: string | null,
  step: 1 | -1,
): string | null {
  if (order.length === 0) {
    return null;
  }
  const index = order.findIndex((player) => player.id === current);
  const next = index < 0 ? (step > 0 ? 0 : order.length - 1) : index + step;
  const wrapped = (next + order.length) % order.length;
  return order[wrapped]?.id ?? null;
}

/** The focus that puts `team` on screen: unchanged when it already is, else that team alone. */
export function focusForTeam(
  layout: SpectateLayout,
  teams: SpectateTeams,
  focus: SpectateFocus,
  team: TeamIndex,
): SpectateFocus {
  if (!teams.includes(team) || visibleTeams(layout, teams, focus).includes(team)) {
    return focus;
  }
  return team;
}

/** What the followed player is doing, for the FollowCard's status line. */
export type FollowActivity =
  | { kind: 'working'; station: StationKind; percent: number }
  | { kind: 'minigame'; station: StationKind }
  | { kind: 'lockout'; station: StationKind; seconds: number }
  | { kind: 'desk' }
  | { kind: 'carrying' }
  | { kind: 'idle' };

export type FollowCardModel = {
  activity: FollowActivity;
  /** The folder in their hands or on their station or desk, if any. */
  folder: Folder | null;
};

type ViewState = {
  folders: readonly Folder[];
  stations: readonly Station[];
  desks: readonly Desk[];
};

function folderOn(state: ViewState, fixtureId: string): Folder | null {
  return (
    state.folders.find(
      (folder) => folder.location.kind === 'fixture' && folder.location.fixtureId === fixtureId,
    ) ?? null
  );
}

/** The FollowCard of `playerId` in a newsroom's state. */
export function followCard(state: ViewState, playerId: string): FollowCardModel {
  const station = state.stations.find((entry) => entry.operatorId === playerId);
  if (station) {
    const folder = folderOn(state, station.id);
    if (station.phase === 'minigame') {
      return { activity: { kind: 'minigame', station: station.kind }, folder };
    }
    if (station.phase === 'lockout') {
      const seconds = Math.max(1, Math.ceil(station.lockoutMs / 1000));
      return { activity: { kind: 'lockout', station: station.kind, seconds }, folder };
    }
    const percent =
      station.durationMs > 0
        ? Math.min(100, Math.floor((100 * station.progressMs) / station.durationMs))
        : 0;
    return { activity: { kind: 'working', station: station.kind, percent }, folder };
  }
  const desk = state.desks.find((entry) => entry.operatorId === playerId);
  if (desk) {
    return { activity: { kind: 'desk' }, folder: folderOn(state, desk.id) };
  }
  const carried = state.folders.find(
    (folder) => folder.location.kind === 'carried' && folder.location.playerId === playerId,
  );
  if (carried) {
    return { activity: { kind: 'carrying' }, folder: carried };
  }
  return { activity: { kind: 'idle' }, folder: null };
}

/**
 * The stations a folder's stamps came from, in the order they were applied: the card shows these
 * icons and nothing of what the stamps say. A stamp the story does not know is left out.
 */
export function stampStations(
  stampIds: readonly string[],
  storyStamps: readonly { id: string; station: StationKind }[],
): StationKind[] {
  const stations: StationKind[] = [];
  for (const id of stampIds) {
    const stamp = storyStamps.find((entry) => entry.id === id);
    if (stamp) {
      stations.push(stamp.station);
    }
  }
  return stations;
}
