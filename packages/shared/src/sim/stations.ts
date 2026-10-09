// Verification stations: occupancy, hold-to-work, minigame round, stamps, lockout (S2-03).
// Emits: workStarted, workCancelled, minigameStarted, minigameFailed, stampApplied, and the end
// of an outage levelEvent (S4-08: a station with outageMs > 0 accepts no work).
// Consumes commands: minigameResult, cancel (when operating a station).
import {
  MINIGAME_FAIL_LOCKOUT_MS,
  ROLE_STATIONS,
  ROLE_WORK_TIME_FACTOR,
  STATION_WORK_MS,
} from '../constants.ts';
import type { StationKind } from '../domain.ts';
import type { Folder, Station } from '../entities.ts';
import type { QueuedCommand, SimFrame } from './frame.ts';
import { findInteractionTarget } from './map.ts';
import { nextInt } from './rng.ts';
import { folderOnFixture, type GameState } from './state.ts';

/** Upper bound (exclusive) for minigame seeds: any non-negative 31-bit integer. */
const MINIGAME_SEED_MAX = 2 ** 31 - 1;

function idleStation(station: Station): Station {
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

/** Work time at a station of `kind` for a player, with the role bonus applied. */
export function workDurationMs(state: GameState, playerId: string, kind: StationKind): number {
  const role = state.crew[playerId]?.role ?? null;
  const roleStations: readonly StationKind[] = role ? ROLE_STATIONS[role] : [];
  const factor = roleStations.includes(kind) ? ROLE_WORK_TIME_FACTOR : 1;
  return STATION_WORK_MS[kind] * factor;
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
  let rng = state.rng;
  let folders = state.folders;
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
          durationMs: workDurationMs(state, candidate, station.kind),
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
        const [seed, rngNext] = nextInt(rng, MINIGAME_SEED_MAX);
        rng = rngNext;
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
            });
          }
          next = idleStation(station);
        } else {
          next = {
            ...idleStation(station),
            phase: 'lockout',
            lockoutMs: MINIGAME_FAIL_LOCKOUT_MS,
          };
          frame.events.push({
            kind: 'minigameFailed',
            stationId,
            playerId: operatorId,
            folderId: folder.id,
          });
        }
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

  if (!changed && folders === state.folders && rng === state.rng) {
    return state;
  }
  return { ...state, rng, folders, stations };
}
