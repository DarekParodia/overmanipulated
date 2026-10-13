// The local player's role ability as the HUD and the press check see it (S7-40): the shared
// `abilityPreview` over the latest snapshot (game store), the room's roles and the runtime's
// positions, with the local player at their predicted spot. `localAbility` is the one-shot read
// for a press; `useLocalAbility` recomputes on every snapshot for the chip and the button.
import {
  type Ability,
  type AbilityPreview,
  abilityOf,
  abilityPreview,
  type PlayerState,
  type Role,
  type RoomStateMessage,
  type SnapshotMessage,
  type TileMap,
} from '@redakcja/shared';
import { hudStory } from '../hud/story-lookup.ts';
import { type GameStore, useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { buildAbilityEnv, buildAbilityView } from './ability-view.ts';

/** Where the positions come from: the game runtime (net/runtime.ts). */
export type AbilitySources = {
  readonly map: TileMap;
  readonly buffer: { latest(): SnapshotMessage | null };
  readonly predictor: { readonly state: PlayerState | null };
};

export type LocalAbility = {
  role: Role | null;
  ability: Ability | null;
  preview: AbilityPreview;
  /** Level time of the snapshot the preview was read from. */
  elapsedMs: number;
};

const NONE: AbilityPreview = { kind: 'none' };

type GameFacts = Pick<GameStore, 'elapsedMs' | 'folders' | 'stations' | 'desks' | 'crew'>;
type RoomFacts = { playerId: string | null; room: RoomStateMessage | null };

/** The preview for the local player from the given store states. */
export function abilityFrom(
  sources: AbilitySources,
  game: GameFacts,
  app: RoomFacts,
): LocalAbility {
  const playerId = app.playerId;
  const roomPlayers = app.room?.players ?? [];
  const role = roomPlayers.find((p) => p.id === playerId)?.role ?? null;
  const ability = abilityOf(role);
  if (playerId === null || ability === null) {
    return { role, ability, preview: NONE, elapsedMs: game.elapsedMs };
  }
  const predicted = sources.predictor.state;
  const view = buildAbilityView({
    elapsedMs: game.elapsedMs,
    folders: game.folders,
    stations: game.stations,
    desks: game.desks,
    crew: game.crew,
    roomPlayers,
    players: sources.buffer.latest()?.players ?? [],
    local: predicted && predicted.id === playerId ? predicted : null,
  });
  const env = buildAbilityEnv(sources.map, hudStory, roomPlayers);
  return { role, ability, preview: abilityPreview(view, playerId, env), elapsedMs: game.elapsedMs };
}

/** One read for a press of R / RB / the touch button by the given local player. */
export function localAbility(sources: AbilitySources, playerId: string | null): LocalAbility {
  return abilityFrom(sources, useGame.getState(), { playerId, room: useApp.getState().room });
}

/** The local ability, recomputed on every snapshot and room change. */
export function useLocalAbility(sources: AbilitySources): LocalAbility {
  // Each snapshot moves the tick; the dev fixture can also swap folders or crew without one.
  useGame((s) => s.tick);
  const elapsedMs = useGame((s) => s.elapsedMs);
  const folders = useGame((s) => s.folders);
  const stations = useGame((s) => s.stations);
  const desks = useGame((s) => s.desks);
  const crew = useGame((s) => s.crew);
  const playerId = useApp((s) => s.playerId);
  const room = useApp((s) => s.room);
  return abilityFrom(sources, { elapsedMs, folders, stations, desks, crew }, { playerId, room });
}
