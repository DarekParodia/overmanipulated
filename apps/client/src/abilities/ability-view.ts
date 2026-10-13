// The client's side of the shared ability preview (S7-40): the snapshot arrays, the room's roles
// and the player positions turned into the `AbilityView` and `AbilityEnv` that `abilityPreview`
// reads in the simulation. Pure, so the HUD chip, the touch button and the press check all see
// what the server will see when the press arrives.
import type {
  AbilityEnv,
  AbilityStory,
  AbilityView,
  CrewSnapshot,
  Desk,
  Folder,
  LobbyPlayer,
  PlayerSnapshot,
  Role,
  Station,
  StationKind,
  TileMap,
} from '@redakcja/shared';

/** A player's position and facing, as the snapshot (or the local prediction) has it. */
export type PlacedPlayer = Pick<PlayerSnapshot, 'id' | 'x' | 'y' | 'facing'>;

export type AbilityViewInput = {
  /** Level time of the latest snapshot. */
  elapsedMs: number;
  folders: readonly Folder[];
  stations: readonly Station[];
  desks: readonly Desk[];
  crew: readonly CrewSnapshot[];
  /** The room's players, for their roles (roles stay out of the snapshot). */
  roomPlayers: readonly Pick<LobbyPlayer, 'id' | 'role'>[];
  /** The latest snapshot's players, in join order. */
  players: readonly PlacedPlayer[];
  /** The local player's predicted position; it replaces the snapshot's one. */
  local?: PlacedPlayer | null;
};

function byId<T extends { id: string }>(items: readonly T[]): Record<string, T> {
  const record: Record<string, T> = {};
  for (const item of items) {
    record[item.id] = item;
  }
  return record;
}

/** The view `abilityPreview` reads, built from the client's snapshot state. */
export function buildAbilityView(input: AbilityViewInput): AbilityView {
  const roles = new Map<string, Role | null>(input.roomPlayers.map((p) => [p.id, p.role]));
  const players: Record<string, { x: number; y: number; facing: number }> = {};
  for (const player of input.players) {
    const placed = input.local?.id === player.id ? input.local : player;
    players[player.id] = { x: placed.x, y: placed.y, facing: placed.facing };
  }
  if (input.local && !(input.local.id in players)) {
    players[input.local.id] = { x: input.local.x, y: input.local.y, facing: input.local.facing };
  }
  const crew: Record<string, AbilityView['crew'][string]> = {};
  for (const { id, ...state } of input.crew) {
    crew[id] = { role: roles.get(id) ?? null, ...state };
  }
  return {
    elapsedMs: input.elapsedMs,
    players,
    crew,
    folders: byId(input.folders),
    stations: byId(input.stations),
    desks: byId(input.desks),
  };
}

/** The story facts the preview reads; stories without stamps give none. */
export type AbilityStoryLookup = (
  storyId: string,
) => { stamps?: readonly { id: string; station: StationKind }[] } | undefined;

/** The preview's environment: the level map, the stories and who is disconnected. */
export function buildAbilityEnv(
  map: TileMap,
  story: AbilityStoryLookup,
  roomPlayers: readonly Pick<LobbyPlayer, 'id' | 'connected'>[],
): AbilityEnv {
  const absent = new Set(roomPlayers.filter((p) => !p.connected).map((p) => p.id));
  return {
    map,
    story: (storyId): AbilityStory | undefined => {
      const stamps = story(storyId)?.stamps;
      return stamps ? { stamps } : undefined;
    },
    absent,
  };
}
