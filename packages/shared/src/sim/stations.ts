// Verification stations: occupancy, hold-to-work, minigame round, stamps, lockout (S2-03).
// Emits: workStarted, workCancelled, minigameStarted, minigameFailed, stampApplied, and the end
// of an outage levelEvent (S4-08: a station with outageMs > 0 accepts no work); `ability` done
// when an armed Ekspertyza or Druga szansa triggers (S7-38).
// Consumes commands: minigameResult, cancel (when operating a station).
// Work time and lockout length follow the difficulty (`ctx.tuning`, Stage 7).
// Minigame seeds are derived per folder spawn key, station kind and attempt (S7-13).
// Armed abilities (S7-38): an armed Ekspertyza that covers the station stamps the folder instead
// of opening the minigame; an armed Druga szansa turns a failure into a fresh round for the same
// operator without the lockout. Both start the cooldown, so the crew is part of the result.
import { MINIGAME_STABLE_SEED_STATIONS, STATION_WORK_MS } from '../constants.ts';
import { type SimTuning, tunedLockoutMs } from '../difficulty.ts';
import type { StationKind } from '../domain.ts';
import type { Folder, Station } from '../entities.ts';
import type { QueuedCommand, SimFrame } from './frame.ts';
import { findInteractionTarget } from './map.ts';
import { minigameSeedFor } from './rng.ts';
import { abilityOf, expertiseCovers, roleWorkFactor, spendAbility } from './roles.ts';
import { folderOnFixture, type GameState } from './state.ts';

/** Key of `GameState.minigameAttempts` for the minigame of `kind` on one folder. */
export function minigameAttemptKey(spawnKey: string, kind: StationKind): string {
  return `${spawnKey}:${kind}`;
}

/**
 * The seed of the next minigame round at a station of `kind` on `folder`: derived from the match
 * seed, the folder's spawn key, the kind and how many rounds there ended without a stamp. Pure,
 * so every newsroom of a match gets the same puzzle for the same folder and attempt.
 */
export function drawMinigameSeed(
  state: Pick<GameState, 'seed' | 'minigameAttempts'>,
  folder: Pick<Folder, 'spawnKey'>,
  kind: StationKind,
): number {
  const attempt = state.minigameAttempts[minigameAttemptKey(folder.spawnKey, kind)] ?? 0;
  return minigameSeedFor(state.seed, folder.spawnKey, kind, attempt);
}

/**
 * Counts a minigame round that ended without a stamp (failed or cancelled), so the next round on
 * this folder gets a fresh puzzle; MINIGAME_STABLE_SEED_STATIONS keep theirs (the Kartoteka
 * shows the same card again).
 */
function countUnstampedRound(
  attempts: Record<string, number>,
  folder: Folder,
  kind: StationKind,
): Record<string, number> {
  if (MINIGAME_STABLE_SEED_STATIONS.includes(kind)) {
    return attempts;
  }
  const key = minigameAttemptKey(folder.spawnKey, kind);
  return { ...attempts, [key]: (attempts[key] ?? 0) + 1 };
}

/** The station with no operator, no progress and no lockout (its outage is kept). */
export function idleStation(station: Station): Station {
  return {
    ...station,
    operatorId: null,
    phase: 'idle',
    progressMs: 0,
    durationMs: 0,
    lockoutMs: 0,
  };
}

/** Whether the player stands at and faces this station (it is their interaction target). */
function isAtStation(state: GameState, frame: SimFrame, playerId: string, stationId: string) {
  const player = state.players[playerId];
  if (!player) {
    return false;
  }
  return findInteractionTarget(frame.ctx.map, player, player.facing)?.id === stationId;
}

function isHoldingWork(frame: SimFrame, playerId: string): boolean {
  return frame.intents[playerId]?.work ?? false;
}

/** The stamp id this station would apply to the folder, if its story has one for the kind. */
function stampFor(frame: SimFrame, folder: Folder, kind: StationKind): string | undefined {
  return frame.ctx.stories[folder.storyId]?.stamps.find((s) => s.station === kind)?.id;
}

/**
 * Work time at a station of `kind` for a player: the role bonus (`roleWorkFactor`, from
 * ROLE_PERKS) and the difficulty's work-time factor applied, rounded to whole milliseconds.
 */
export function workDurationMs(
  state: GameState,
  playerId: string,
  kind: StationKind,
  tuning: SimTuning,
): number {
  const role = state.crew[playerId]?.role ?? null;
  return Math.round(STATION_WORK_MS[kind] * roleWorkFactor(role, kind) * tuning.workTimeFactor);
}

/** The first command from the operator that concerns this station, if any. */
function operatorCommand(
  commands: readonly QueuedCommand[],
  operatorId: string,
  stationId: string,
): QueuedCommand['command'] | undefined {
  for (const { playerId, command } of commands) {
    if (playerId !== operatorId) {
      continue;
    }
    if (command.kind === 'cancel') {
      return command;
    }
    if (command.kind === 'minigameResult' && command.stationId === stationId) {
      return command;
    }
  }
  return undefined;
}

export function stepStations(state: GameState, frame: SimFrame): GameState {
  const { dtMs } = frame.ctx;
  let attempts = state.minigameAttempts;
  let folders = state.folders;
  let crew = state.crew;
  const stations: Record<string, Station> = {};
  // Operators as of the stations already processed this tick plus the ones still to come.
  const operators = new Set<string>();
  for (const station of Object.values(state.stations)) {
    if (station.operatorId !== null) {
      operators.add(station.operatorId);
    }
  }
  let changed = false;

  for (const [stationId, station] of Object.entries(state.stations)) {
    let next = station;
    // Each folder lies on one fixture, so earlier stations' stamp writes never affect this one.
    const folder = folderOnFixture(state, stationId);
    const operatorId = station.operatorId;

    if (station.outageMs > 0) {
      // A down station accepts no work: the operator is kicked out, the countdown runs.
      const outageMs = Math.max(0, station.outageMs - dtMs);
      if (operatorId !== null) {
        operators.delete(operatorId);
        frame.events.push({ kind: 'workCancelled', stationId, playerId: operatorId });
        if (station.phase === 'minigame' && folder) {
          attempts = countUnstampedRound(attempts, folder, station.kind);
        }
      }
      if (outageMs === 0) {
        frame.events.push({
          kind: 'levelEvent',
          event: 'outage',
          phase: 'end',
          folderIds: [],
          stationId,
        });
      }
      stations[stationId] = { ...idleStation(station), outageMs };
      changed = true;
      continue;
    }

    switch (station.phase) {
      case 'idle': {
        if (!folder) {
          break;
        }
        const stampId = stampFor(frame, folder, station.kind);
        if (stampId !== undefined && folder.stamps.includes(stampId)) {
          break;
        }
        // One operator per station; the first eligible player in join order takes it.
        const candidate = Object.keys(state.players).find(
          (id) =>
            !operators.has(id) &&
            isHoldingWork(frame, id) &&
            isAtStation(state, frame, id, stationId),
        );
        if (candidate === undefined) {
          break;
        }
        operators.add(candidate);
        next = {
          ...station,
          operatorId: candidate,
          phase: 'working',
          progressMs: 0,
          durationMs: workDurationMs(state, candidate, station.kind, frame.ctx.tuning),
          lockoutMs: 0,
        };
        frame.events.push({ kind: 'workStarted', stationId, playerId: candidate });
        break;
      }

      case 'working': {
        if (operatorId === null || !state.players[operatorId]) {
          next = idleStation(station);
          if (operatorId !== null) {
            operators.delete(operatorId);
          }
          break;
        }
        const cancelled = operatorCommand(frame.commands, operatorId, stationId)?.kind === 'cancel';
        if (
          cancelled ||
          !folder ||
          !isHoldingWork(frame, operatorId) ||
          !isAtStation(state, frame, operatorId, stationId)
        ) {
          next = idleStation(station);
          operators.delete(operatorId);
          frame.events.push({ kind: 'workCancelled', stationId, playerId: operatorId });
          break;
        }
        const progressMs = Math.min(station.progressMs + dtMs, station.durationMs);
        if (progressMs < station.durationMs) {
          next = { ...station, progressMs };
          break;
        }
        const operator = crew[operatorId];
        const stampId = stampFor(frame, folder, station.kind);
        if (
          operator?.abilityArmed &&
          expertiseCovers(operator.role, station.kind) &&
          stampId !== undefined &&
          !folder.stamps.includes(stampId)
        ) {
          // Armed Ekspertyza: the stamp lands without the minigame and the operator is free.
          folders = { ...folders, [folder.id]: { ...folder, stamps: [...folder.stamps, stampId] } };
          frame.events.push(
            {
              kind: 'stampApplied',
              stationId,
              playerId: operatorId,
              folderId: folder.id,
              stampId,
              via: 'expertise',
            },
            {
              kind: 'ability',
              playerId: operatorId,
              ability: 'expertise',
              stage: 'done',
              stationId,
              folderId: folder.id,
            },
          );
          crew = spendAbility(crew, operatorId, 'expertise', state.elapsedMs);
          next = idleStation(station);
          operators.delete(operatorId);
          break;
        }
        const seed = drawMinigameSeed(
          { seed: state.seed, minigameAttempts: attempts },
          folder,
          station.kind,
        );
        next = { ...station, progressMs, phase: 'minigame', minigameSeed: seed };
        frame.events.push({
          kind: 'minigameStarted',
          stationId,
          station: station.kind,
          playerId: operatorId,
          folderId: folder.id,
          seed,
        });
        break;
      }

      case 'minigame': {
        if (operatorId === null || !state.players[operatorId]) {
          next = idleStation(station);
          if (operatorId !== null) {
            operators.delete(operatorId);
          }
          break;
        }
        if (!folder) {
          next = idleStation(station);
          operators.delete(operatorId);
          frame.events.push({ kind: 'workCancelled', stationId, playerId: operatorId });
          break;
        }
        const command = operatorCommand(frame.commands, operatorId, stationId);
        if (!command) {
          break;
        }
        if (command.kind === 'cancel') {
          next = idleStation(station);
          operators.delete(operatorId);
          frame.events.push({ kind: 'workCancelled', stationId, playerId: operatorId });
          attempts = countUnstampedRound(attempts, folder, station.kind);
          break;
        }
        if (command.kind !== 'minigameResult') {
          break;
        }
        if (command.success) {
          const stampId = stampFor(frame, folder, station.kind);
          if (stampId !== undefined && !folder.stamps.includes(stampId)) {
            folders = {
              ...folders,
              [folder.id]: { ...folder, stamps: [...folder.stamps, stampId] },
            };
            frame.events.push({
              kind: 'stampApplied',
              stationId,
              playerId: operatorId,
              folderId: folder.id,
              stampId,
              via: 'minigame',
            });
          }
          next = idleStation(station);
          operators.delete(operatorId);
          break;
        }
        attempts = countUnstampedRound(attempts, folder, station.kind);
        const operator = crew[operatorId];
        if (operator?.abilityArmed && abilityOf(operator.role) === 'secondChance') {
          // Armed Druga szansa: no lockout, the same operator gets the next round at once (the
          // Kartoteka's stable seed shows the same card again).
          const seed = drawMinigameSeed(
            { seed: state.seed, minigameAttempts: attempts },
            folder,
            station.kind,
          );
          next = { ...station, minigameSeed: seed, lockoutMs: 0 };
          frame.events.push(
            {
              kind: 'minigameFailed',
              stationId,
              playerId: operatorId,
              folderId: folder.id,
              lockoutMs: 0,
            },
            {
              kind: 'ability',
              playerId: operatorId,
              ability: 'secondChance',
              stage: 'done',
              stationId,
              folderId: folder.id,
            },
            {
              kind: 'minigameStarted',
              stationId,
              station: station.kind,
              playerId: operatorId,
              folderId: folder.id,
              seed,
            },
          );
          crew = spendAbility(crew, operatorId, 'secondChance', state.elapsedMs);
          break;
        }
        const lockoutMs = tunedLockoutMs(frame.ctx.tuning);
        next = { ...idleStation(station), phase: 'lockout', lockoutMs };
        frame.events.push({
          kind: 'minigameFailed',
          stationId,
          playerId: operatorId,
          folderId: folder.id,
          lockoutMs,
        });
        operators.delete(operatorId);
        break;
      }

      case 'lockout': {
        const lockoutMs = Math.max(0, station.lockoutMs - dtMs);
        next = lockoutMs === 0 ? idleStation(station) : { ...station, operatorId: null, lockoutMs };
        break;
      }
    }

    if (next !== station) {
      changed = true;
    }
    stations[stationId] = next;
  }

  if (
    !changed &&
    folders === state.folders &&
    attempts === state.minigameAttempts &&
    crew === state.crew
  ) {
    return state;
  }
  return { ...state, minigameAttempts: attempts, folders, stations, crew };
}
