// Role abilities (S7-37): the shared ability preview, the useAbility press and the per-tick
// progress of running abilities. The same preview runs in the simulation, the client HUD and
// the balance bots, so a press never names its target: the server resolves it here.
// Emits: ability (armed/disarmed/started/done/cancelled), stampApplied (via fieldCall),
// folderRescued.
// Consumes commands: useAbility.
// Runs first in the tick, before folder expiry, so a press or a rescue on a folder's deadline
// tick still counts.
import { ABILITY, RESCUE_ADD_MS } from '../constants.ts';
import type { Ability, Role, StationKind } from '../domain.ts';
import type { AbilityState, Desk, Folder, Station } from '../entities.ts';
import { raidOfFolder } from './events.ts';
import type { SimContext, SimFrame } from './frame.ts';
import type { TileMap } from './map.ts';
import { abilityOf } from './roles.ts';
import type { CrewMember, GameState } from './state.ts';

/** The game facts the preview reads; `GameState` and the client's snapshot view both fit it. */
export type AbilityView = {
  elapsedMs: number;
  /** Keyed by player id, in join order. */
  players: Readonly<Record<string, { x: number; y: number; facing: number }>>;
  crew: Readonly<Record<string, { role: Role | null } & AbilityState>>;
  folders: Readonly<Record<string, Folder>>;
  stations: Readonly<Record<string, Station>>;
  desks: Readonly<Record<string, Desk>>;
};

/** The story facts the preview needs: which station kind gives which stamp. */
export type AbilityStory = { stamps: readonly { id: string; station: StationKind }[] };

/** Fixed inputs of the preview besides the view. */
export type AbilityEnv = {
  map: TileMap;
  story(storyId: string): AbilityStory | undefined;
  /** Disconnected players; Podaj teczkę never targets them (S7-38). */
  absent?: ReadonlySet<string>;
};

export type AbilityBlockReason =
  | 'noStation'
  | 'noFolder'
  | 'noStamp'
  | 'noPhone'
  | 'noTarget'
  | 'noFolders'
  | 'busy';

/** What a press of the role ability would do now (first match wins, see `abilityPreview`). */
export type AbilityPreview =
  /** No role, or not in the crew: there is no ability. */
  | { kind: 'none' }
  /** Telefon z terenu is dialling for the folder. */
  | { kind: 'calling'; folderId: string; endsAtMs: number }
  /** Armed and waiting for its trigger; a press disarms. */
  | { kind: 'armed' }
  | { kind: 'cooling'; readyAtMs: number }
  | { kind: 'blocked'; reason: AbilityBlockReason }
  /** A press arms the ability (Ekspertyza, Druga szansa; S7-38). */
  | { kind: 'arm' }
  /** A press acts at once on the named target. */
  | { kind: 'now'; folderId?: string; stationId?: string; targetPlayerId?: string };

/** The folder a player carries in the view, if any. */
function carriedIn(view: AbilityView, playerId: string): Folder | undefined {
  return Object.values(view.folders).find(
    (f) => f.location.kind === 'carried' && f.location.playerId === playerId,
  );
}

/** The first phone station of the view (map reading order), if the level has one. */
function phoneStationId(view: AbilityView): string | undefined {
  return Object.values(view.stations).find((station) => station.kind === 'phone')?.id;
}

/** The phone stamp of a folder's story, if the story has one. */
function phoneStampOf(folder: Folder, env: AbilityEnv): string | undefined {
  return env.story(folder.storyId)?.stamps.find((stamp) => stamp.station === 'phone')?.id;
}

/**
 * Przedłużenie's target: the folder the player carries, else the folder on the desk the player
 * operates, else the team's folder with the least time left (ties: the earlier spawn, then the
 * lower id). Null when no folder is in play.
 */
export function pickExtendTarget(view: AbilityView, playerId: string): string | null {
  const carried = carriedIn(view, playerId);
  if (carried) {
    return carried.id;
  }
  const desk = Object.values(view.desks).find((d) => d.operatorId === playerId);
  if (desk) {
    const onDesk = Object.values(view.folders).find(
      (f) => f.location.kind === 'fixture' && f.location.fixtureId === desk.id,
    );
    if (onDesk) {
      return onDesk.id;
    }
  }
  let best: Folder | undefined;
  for (const folder of Object.values(view.folders)) {
    if (
      !best ||
      folder.deadlineMs < best.deadlineMs ||
      (folder.deadlineMs === best.deadlineMs &&
        (folder.spawnedAtMs < best.spawnedAtMs ||
          (folder.spawnedAtMs === best.spawnedAtMs && folder.id < best.id)))
    ) {
      best = folder;
    }
  }
  return best?.id ?? null;
}

function fieldCallPreview(view: AbilityView, playerId: string, env: AbilityEnv): AbilityPreview {
  if (phoneStationId(view) === undefined) {
    return { kind: 'blocked', reason: 'noPhone' };
  }
  const folder = carriedIn(view, playerId);
  if (!folder) {
    return { kind: 'blocked', reason: 'noFolder' };
  }
  const stampId = phoneStampOf(folder, env);
  if (stampId === undefined || folder.stamps.includes(stampId)) {
    return { kind: 'blocked', reason: 'noStamp' };
  }
  return { kind: 'now', folderId: folder.id };
}

/** The per-ability rule, once the player has a ready, unarmed, idle ability. */
function ruleFor(
  ability: Ability,
  view: AbilityView,
  playerId: string,
  env: AbilityEnv,
): AbilityPreview {
  switch (ability) {
    case 'extendDeadline': {
      const folderId = pickExtendTarget(view, playerId);
      return folderId === null
        ? { kind: 'blocked', reason: 'noFolders' }
        : { kind: 'now', folderId };
    }
    case 'fieldCall':
      return fieldCallPreview(view, playerId, env);
    // Ekspertyza, Druga szansa and Podaj teczkę get their rules in S7-38; until then a press
    // does nothing.
    case 'expertise':
    case 'secondChance':
      return { kind: 'blocked', reason: 'noStation' };
    case 'passFolder':
      return { kind: 'blocked', reason: 'noTarget' };
  }
}

/**
 * What a press of the player's role ability would do now. First match wins: no ability
 * (`none`), a running call (`calling`), armed (`armed`), the cooldown (`cooling`), then the
 * ability's own rule (`now`, `arm` or `blocked`).
 */
export function abilityPreview(
  view: AbilityView,
  playerId: string,
  env: AbilityEnv,
): AbilityPreview {
  const member = view.crew[playerId];
  const ability = abilityOf(member?.role ?? null);
  if (!member || !ability || !(playerId in view.players)) {
    return { kind: 'none' };
  }
  if (member.fieldCall !== null) {
    return {
      kind: 'calling',
      folderId: member.fieldCall.folderId,
      endsAtMs: member.fieldCall.endsAtMs,
    };
  }
  if (member.abilityArmed) {
    return { kind: 'armed' };
  }
  if (view.elapsedMs < member.abilityReadyAtMs) {
    return { kind: 'cooling', readyAtMs: member.abilityReadyAtMs };
  }
  return ruleFor(ability, view, playerId, env);
}

/** The preview environment of a level run (the simulation's and the balance bots'). */
export function abilityEnvOf(ctx: Pick<SimContext, 'map' | 'stories'>): AbilityEnv {
  const { map, stories } = ctx;
  return { map, story: (storyId) => stories[storyId] };
}

/**
 * Adds `addMs` to a folder's deadline, and to every folder of its botRaid wave (the wave expires
 * together, so extending one alone would not save it). Each folder records the added time in
 * `extendedMs` and may warn again. Returns the folders that got the time, in wave order.
 */
export function extendFolders(
  state: GameState,
  folderId: string,
  addMs: number,
): { state: GameState; folderIds: string[] } {
  const raid = raidOfFolder(state, folderId);
  const wave = raid ? raid.folderIds.filter((id) => id in state.folders) : [folderId];
  const folders = { ...state.folders };
  const folderIds: string[] = [];
  for (const id of wave) {
    const folder = folders[id];
    if (!folder) {
      continue;
    }
    folders[id] = {
      ...folder,
      deadlineMs: folder.deadlineMs + addMs,
      extendedMs: (folder.extendedMs ?? 0) + addMs,
      warned: false,
    };
    folderIds.push(id);
  }
  return folderIds.length === 0
    ? { state, folderIds }
    : { state: { ...state, folders }, folderIds };
}

/** Replaces one crew member. */
function withMember(state: GameState, playerId: string, member: CrewMember): GameState {
  return { ...state, crew: { ...state.crew, [playerId]: member } };
}

/** The effect happened: disarm and start the cooldown. */
function consume(state: GameState, playerId: string, ability: Ability): GameState {
  const member = state.crew[playerId];
  if (!member) {
    return state;
  }
  return withMember(state, playerId, {
    ...member,
    abilityArmed: false,
    abilityReadyAtMs: state.elapsedMs + ABILITY[ability].cooldownMs,
  });
}

/** Applies an ability whose preview is `now`. */
function apply(
  state: GameState,
  frame: SimFrame,
  playerId: string,
  ability: Ability,
  preview: Extract<AbilityPreview, { kind: 'now' }>,
): GameState {
  switch (ability) {
    case 'extendDeadline': {
      if (preview.folderId === undefined) {
        return state;
      }
      const addedMs = ABILITY.extendDeadline.addMs;
      const extended = extendFolders(state, preview.folderId, addedMs);
      frame.events.push({
        kind: 'ability',
        playerId,
        ability,
        stage: 'done',
        folderId: preview.folderId,
        addedMs,
      });
      return consume(extended.state, playerId, ability);
    }
    case 'fieldCall': {
      const member = state.crew[playerId];
      if (preview.folderId === undefined || !member) {
        return state;
      }
      frame.events.push({
        kind: 'ability',
        playerId,
        ability,
        stage: 'started',
        folderId: preview.folderId,
      });
      return withMember(state, playerId, {
        ...member,
        fieldCall: {
          folderId: preview.folderId,
          endsAtMs: state.elapsedMs + ABILITY.fieldCall.callMs,
        },
      });
    }
    // No `now` preview exists for these until S7-38.
    case 'expertise':
    case 'secondChance':
    case 'passFolder':
      return state;
  }
}

/**
 * One press of the role ability: disarm when armed, arm when the preview says so, act when it is
 * `now`. Every other preview (no role, cooling, blocked, a call running) leaves the state as it
 * is and emits nothing; the client explains it from the same preview.
 */
export function useAbility(state: GameState, frame: SimFrame, playerId: string): GameState {
  const member = state.crew[playerId];
  const ability = abilityOf(member?.role ?? null);
  if (!member || !ability) {
    return state;
  }
  const preview = abilityPreview(state, playerId, abilityEnvOf(frame.ctx));
  switch (preview.kind) {
    case 'armed':
      frame.events.push({ kind: 'ability', playerId, ability, stage: 'disarmed' });
      return withMember(state, playerId, { ...member, abilityArmed: false });
    case 'arm':
      frame.events.push({ kind: 'ability', playerId, ability, stage: 'armed' });
      return withMember(state, playerId, { ...member, abilityArmed: true });
    case 'now':
      return apply(state, frame, playerId, ability, preview);
    default:
      return state;
  }
}

/**
 * Telefon z terenu calls in progress: cancelled (without a cooldown) when the folder is gone or
 * left the caller's hands, finished when the call time is up. A finished call adds the folder's
 * phone stamp, as the first phone station of the level, and starts the cooldown.
 */
export function progressFieldCalls(state: GameState, frame: SimFrame): GameState {
  let next = state;
  for (const [playerId, member] of Object.entries(state.crew)) {
    const call = member.fieldCall;
    if (call === null) {
      continue;
    }
    const folder = next.folders[call.folderId];
    const carried = folder?.location.kind === 'carried' && folder.location.playerId === playerId;
    if (!folder || !carried) {
      frame.events.push({
        kind: 'ability',
        playerId,
        ability: 'fieldCall',
        stage: 'cancelled',
        folderId: call.folderId,
        reason: folder ? 'dropped' : 'gone',
      });
      next = withMember(next, playerId, { ...member, fieldCall: null });
      continue;
    }
    if (next.elapsedMs < call.endsAtMs) {
      continue;
    }
    const stationId = phoneStationId(next);
    const stampId = phoneStampOf(folder, abilityEnvOf(frame.ctx));
    if (stationId !== undefined && stampId !== undefined && !folder.stamps.includes(stampId)) {
      next = {
        ...next,
        folders: {
          ...next.folders,
          [folder.id]: { ...folder, stamps: [...folder.stamps, stampId] },
        },
      };
      frame.events.push({
        kind: 'stampApplied',
        stationId,
        playerId,
        folderId: folder.id,
        stampId,
        via: 'fieldCall',
      });
    }
    frame.events.push({
      kind: 'ability',
      playerId,
      ability: 'fieldCall',
      stage: 'done',
      folderId: folder.id,
    });
    next = withMember(next, playerId, { ...member, fieldCall: null });
    next = consume(next, playerId, 'fieldCall');
  }
  return next;
}

/**
 * Koło ratunkowe: a folder that reaches its deadline in the hands of a player with rescues left
 * gets RESCUE_ADD_MS (with its botRaid wave) and uses up one rescue. Runs after the presses, so
 * a Przedłużenie on the same tick saves the charge.
 */
export function rescueCarriedFolders(state: GameState, frame: SimFrame): GameState {
  let next = state;
  for (const id of Object.keys(state.folders)) {
    const folder = next.folders[id];
    if (folder?.location.kind !== 'carried' || next.elapsedMs < folder.deadlineMs) {
      continue;
    }
    const playerId = folder.location.playerId;
    const member = next.crew[playerId];
    if (!member || member.rescuesLeft <= 0) {
      continue;
    }
    const extended = extendFolders(next, id, RESCUE_ADD_MS);
    next = withMember(extended.state, playerId, { ...member, rescuesLeft: member.rescuesLeft - 1 });
    frame.events.push({
      kind: 'folderRescued',
      playerId,
      folderId: id,
      addedMs: RESCUE_ADD_MS,
      folderIds: extended.folderIds,
    });
  }
  return next;
}

/**
 * The first subsystem of a tick: the ability presses in arrival order, then running calls, then
 * rescues. Returns the same state when nothing happened.
 */
export function stepAbilities(state: GameState, frame: SimFrame): GameState {
  let next = state;
  for (const { playerId, command } of frame.commands) {
    if (command.kind === 'useAbility') {
      next = useAbility(next, frame, playerId);
    }
  }
  next = progressFieldCalls(next, frame);
  return rescueCarriedFolders(next, frame);
}
