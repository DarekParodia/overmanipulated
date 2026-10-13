// Role abilities (S7-37, S7-38): the shared ability preview, the useAbility press and the
// per-tick progress of running abilities. The same preview runs in the simulation, the client
// HUD and the balance bots, so a press never names its target: the server resolves it here.
// Armed Ekspertyza and Druga szansa trigger inside `stepStations` (stations.ts).
// Emits: ability (armed/disarmed/started/done/cancelled), stampApplied (via expertise or
// fieldCall), minigameStarted (an immediate Druga szansa), folderRescued.
// Consumes commands: useAbility.
// Runs first in the tick, before folder expiry, so a press or a rescue on a folder's deadline
// tick still counts.
import { ABILITY, RESCUE_ADD_MS } from '../constants.ts';
import type { Ability, Role, StationKind } from '../domain.ts';
import type { AbilityState, Desk, Folder, Station } from '../entities.ts';
import { raidOfFolder } from './events.ts';
import type { SimContext, SimFrame } from './frame.ts';
import { findInteractionTarget, fixtureById, type TileMap, tileCenter } from './map.ts';
import { abilityOf, expertiseCovers, spendAbility } from './roles.ts';
import type { CrewMember, GameState } from './state.ts';
import { drawMinigameSeed, idleStation, workDurationMs } from './stations.ts';

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
  /** Disconnected players; Podaj teczkę never targets them. */
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
  /** A press arms the ability (Ekspertyza, Druga szansa). */
  | { kind: 'arm' }
  /** A press acts at once on the named target. */
  | { kind: 'now'; folderId?: string; stationId?: string; targetPlayerId?: string };

/** The folder a player carries in the view, if any. */
function carriedIn(view: AbilityView, playerId: string): Folder | undefined {
  return Object.values(view.folders).find(
    (f) => f.location.kind === 'carried' && f.location.playerId === playerId,
  );
}

/** The folder lying on a fixture of the view, if any. */
function folderOn(view: AbilityView, fixtureId: string): Folder | undefined {
  return Object.values(view.folders).find(
    (f) => f.location.kind === 'fixture' && f.location.fixtureId === fixtureId,
  );
}

/** Whether the player operates a station (working, minigame) or a desk. */
function operatesAnything(view: AbilityView, playerId: string): boolean {
  return (
    Object.values(view.stations).some((station) => station.operatorId === playerId) ||
    Object.values(view.desks).some((desk) => desk.operatorId === playerId)
  );
}

/** The stamp of the folder's story for a station kind, if the story has one. */
function stampOfKind(folder: Folder, kind: StationKind, env: AbilityEnv): string | undefined {
  return env.story(folder.storyId)?.stamps.find((stamp) => stamp.station === kind)?.id;
}

/** The first phone station of the view (map reading order), if the level has one. */
function phoneStationId(view: AbilityView): string | undefined {
  return Object.values(view.stations).find((station) => station.kind === 'phone')?.id;
}

/** The phone stamp of a folder's story, if the story has one. */
function phoneStampOf(folder: Folder, env: AbilityEnv): string | undefined {
  return stampOfKind(folder, 'phone', env);
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

/**
 * Ekspertyza's minigame target: the station the player plays a minigame at, when the role's
 * Ekspertyza covers it and the folder there still lacks the station's stamp.
 */
function expertiseTarget(
  view: AbilityView,
  playerId: string,
  role: Role | null,
  env: AbilityEnv,
): { station: Station; folder: Folder; stampId: string } | undefined {
  const station = Object.values(view.stations).find(
    (s) => s.operatorId === playerId && s.phase === 'minigame',
  );
  if (!station || !expertiseCovers(role, station.kind)) {
    return undefined;
  }
  const folder = folderOn(view, station.id);
  const stampId = folder ? stampOfKind(folder, station.kind, env) : undefined;
  if (!folder || stampId === undefined || folder.stamps.includes(stampId)) {
    return undefined;
  }
  return { station, folder, stampId };
}

/**
 * Ekspertyza: `now` in a covered minigame, else `arm` (the next covered minigame is solved
 * when it would open) when the level has a station of the role's family, else `noStation`.
 */
function expertisePreview(
  view: AbilityView,
  playerId: string,
  role: Role | null,
  env: AbilityEnv,
): AbilityPreview {
  const target = expertiseTarget(view, playerId, role, env);
  if (target) {
    return { kind: 'now', stationId: target.station.id, folderId: target.folder.id };
  }
  return Object.values(view.stations).some((station) => expertiseCovers(role, station.kind))
    ? { kind: 'arm' }
    : { kind: 'blocked', reason: 'noStation' };
}

/** A station locked after a failed minigame, with the folder still on it. */
function lockedWithFolder(view: AbilityView, station: Station | undefined): Folder | undefined {
  return station?.phase === 'lockout' ? folderOn(view, station.id) : undefined;
}

/**
 * Druga szansa: `now` for a free player at a locked station (the faced one, else the nearest
 * within `ABILITY.secondChance.rangeTiles`, ties in station order); otherwise `arm`, so the next
 * failed minigame reopens at once. Never blocked.
 */
function secondChancePreview(view: AbilityView, playerId: string, env: AbilityEnv): AbilityPreview {
  const player = view.players[playerId];
  if (!player || operatesAnything(view, playerId)) {
    return { kind: 'arm' };
  }
  const faced = findInteractionTarget(env.map, player, player.facing);
  const facedStation = faced ? view.stations[faced.id] : undefined;
  const facedFolder = lockedWithFolder(view, facedStation);
  if (facedStation && facedFolder) {
    return { kind: 'now', stationId: facedStation.id, folderId: facedFolder.id };
  }
  let best: { stationId: string; folderId: string; distance: number } | undefined;
  for (const station of Object.values(view.stations)) {
    const folder = lockedWithFolder(view, station);
    const fixture = fixtureById(env.map, station.id);
    if (!folder || !fixture) {
      continue;
    }
    const center = tileCenter(fixture.col, fixture.row);
    const distance = Math.hypot(center.x - player.x, center.y - player.y);
    if (distance <= ABILITY.secondChance.rangeTiles && (!best || distance < best.distance)) {
      best = { stationId: station.id, folderId: folder.id, distance };
    }
  }
  return best
    ? { kind: 'now', stationId: best.stationId, folderId: best.folderId }
    : { kind: 'arm' };
}

/**
 * Podaj teczkę's receiver: the nearest teammate within `ABILITY.passFolder.rangeTiles` (no line
 * of sight) who is connected (not in `env.absent`), carries no folder and operates no station or
 * desk; ties go to join order. Null when nobody qualifies.
 */
export function pickPassTarget(
  view: AbilityView,
  playerId: string,
  env: AbilityEnv,
): string | null {
  const passer = view.players[playerId];
  if (!passer) {
    return null;
  }
  let best: { id: string; distance: number } | undefined;
  for (const [id, player] of Object.entries(view.players)) {
    if (
      id === playerId ||
      env.absent?.has(id) ||
      carriedIn(view, id) ||
      operatesAnything(view, id)
    ) {
      continue;
    }
    const distance = Math.hypot(player.x - passer.x, player.y - passer.y);
    if (distance <= ABILITY.passFolder.rangeTiles && (!best || distance < best.distance)) {
      best = { id, distance };
    }
  }
  return best?.id ?? null;
}

function passFolderPreview(view: AbilityView, playerId: string, env: AbilityEnv): AbilityPreview {
  const folder = carriedIn(view, playerId);
  if (!folder) {
    return { kind: 'blocked', reason: 'noFolder' };
  }
  const targetPlayerId = pickPassTarget(view, playerId, env);
  return targetPlayerId === null
    ? { kind: 'blocked', reason: 'noTarget' }
    : { kind: 'now', folderId: folder.id, targetPlayerId };
}

/** The per-ability rule, once the player has a ready, unarmed, idle ability. */
function ruleFor(
  ability: Ability,
  role: Role | null,
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
    case 'expertise':
      return expertisePreview(view, playerId, role, env);
    case 'secondChance':
      return secondChancePreview(view, playerId, env);
    case 'passFolder':
      return passFolderPreview(view, playerId, env);
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
  return ruleFor(ability, member.role, view, playerId, env);
}

/** The preview environment of a level run (the simulation's and the balance bots'). */
export function abilityEnvOf(ctx: Pick<SimContext, 'map' | 'stories' | 'absent'>): AbilityEnv {
  const { map, stories, absent } = ctx;
  return { map, story: (storyId) => stories[storyId], ...(absent ? { absent } : {}) };
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
  const crew = spendAbility(state.crew, playerId, ability, state.elapsedMs);
  return crew === state.crew ? state : { ...state, crew };
}

/** Ekspertyza in a running minigame: the stamp lands at once and the station is free. */
function applyExpertise(state: GameState, frame: SimFrame, playerId: string): GameState {
  const member = state.crew[playerId];
  const target = expertiseTarget(state, playerId, member?.role ?? null, abilityEnvOf(frame.ctx));
  if (!target) {
    return state;
  }
  const { station, folder, stampId } = target;
  frame.events.push(
    {
      kind: 'stampApplied',
      stationId: station.id,
      playerId,
      folderId: folder.id,
      stampId,
      via: 'expertise',
    },
    {
      kind: 'ability',
      playerId,
      ability: 'expertise',
      stage: 'done',
      stationId: station.id,
      folderId: folder.id,
    },
  );
  const next: GameState = {
    ...state,
    folders: { ...state.folders, [folder.id]: { ...folder, stamps: [...folder.stamps, stampId] } },
    stations: { ...state.stations, [station.id]: idleStation(station) },
  };
  return consume(next, playerId, 'expertise');
}

/**
 * Druga szansa at a locked station: the lockout ends and the player gets the next minigame
 * round at once, without the hold (the seed follows `drawMinigameSeed`).
 */
function applySecondChance(
  state: GameState,
  frame: SimFrame,
  playerId: string,
  stationId: string,
  folderId: string,
): GameState {
  const station = state.stations[stationId];
  const folder = state.folders[folderId];
  if (!station || !folder) {
    return state;
  }
  const seed = drawMinigameSeed(state, folder, station.kind);
  const durationMs = workDurationMs(state, playerId, station.kind, frame.ctx.tuning);
  frame.events.push(
    {
      kind: 'minigameStarted',
      stationId,
      station: station.kind,
      playerId,
      folderId,
      seed,
    },
    { kind: 'ability', playerId, ability: 'secondChance', stage: 'done', stationId, folderId },
  );
  const reopened: Station = {
    ...station,
    operatorId: playerId,
    phase: 'minigame',
    minigameSeed: seed,
    lockoutMs: 0,
    progressMs: durationMs,
    durationMs,
  };
  return consume(
    { ...state, stations: { ...state.stations, [stationId]: reopened } },
    playerId,
    'secondChance',
  );
}

/** Podaj teczkę: the carried folder is in the receiver's hands at once (the arc is cosmetic). */
function applyPassFolder(
  state: GameState,
  frame: SimFrame,
  playerId: string,
  folderId: string,
  targetPlayerId: string,
): GameState {
  const folder = state.folders[folderId];
  if (!folder) {
    return state;
  }
  frame.events.push({
    kind: 'ability',
    playerId,
    ability: 'passFolder',
    stage: 'done',
    folderId,
    targetPlayerId,
  });
  const passed: Folder = { ...folder, location: { kind: 'carried', playerId: targetPlayerId } };
  return consume(
    { ...state, folders: { ...state.folders, [folderId]: passed } },
    playerId,
    'passFolder',
  );
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
    case 'expertise':
      return applyExpertise(state, frame, playerId);
    case 'secondChance':
      return preview.stationId === undefined || preview.folderId === undefined
        ? state
        : applySecondChance(state, frame, playerId, preview.stationId, preview.folderId);
    case 'passFolder':
      return preview.folderId === undefined || preview.targetPlayerId === undefined
        ? state
        : applyPassFolder(state, frame, playerId, preview.folderId, preview.targetPlayerId);
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
