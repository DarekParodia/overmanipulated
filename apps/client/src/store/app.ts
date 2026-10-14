// Application state: current screen, session and the latest room state from the server.
import {
  DEFAULT_DIFFICULTY,
  type Difficulty,
  type ErrorCode,
  type MemberKind,
  type RoomStateMessage,
  type RunSummary,
  type TeamIndex,
} from '@redakcja/shared';
import { create } from 'zustand';
import { readStored, writeStored } from './safe-storage.ts';

export type ScreenId = 'mainMenu' | 'lobby' | 'briefing' | 'game' | 'spectate' | 'styleguide';
export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';
export type UiError = ErrorCode | 'connectionLost';

const NICKNAME_KEY = 'redakcja.nickname';

type AppStore = {
  screen: ScreenId;
  nickname: string;
  connection: ConnectionStatus;
  playerId: string | null;
  room: RoomStateMessage | null;
  /**
   * The difficulty of the room the player is in, or of the last one they were in (it stays after
   * leaving, so pickers can start from it); Normal before any room.
   */
  difficulty: Difficulty;
  /** The run dealt at the briefing (folders, max score, stars); null in the lobby or menu. */
  run: RunSummary | null;
  error: UiError | null;
  /**
   * The room code of the last join by code (S7-84), so a `matchInProgress` answer can offer to
   * watch the same room; null after creating a room.
   */
  lastJoinCode: string | null;
  rttMs: number | null;
  inputDevice: InputDevice;
  settingsOpen: boolean;
  setNickname(nickname: string): void;
  /** Takes a server `roomState`: the room, its difficulty and its dealt run. */
  setRoom(room: RoomStateMessage): void;
  /** Leaves the room view; the last difficulty stays. */
  clearRoom(): void;
  setScreen(screen: ScreenId): void;
  setError(error: UiError | null): void;
  setInputDevice(device: InputDevice): void;
  setSettingsOpen(open: boolean): void;
};

function initialDevice(): InputDevice {
  try {
    return globalThis.matchMedia?.('(pointer: coarse)').matches ? 'touch' : 'keyboard';
  } catch {
    return 'keyboard';
  }
}

export const useApp = create<AppStore>((set, get) => ({
  screen: 'mainMenu',
  nickname: readStored('local', NICKNAME_KEY) ?? '',
  connection: 'idle',
  playerId: null,
  room: null,
  difficulty: DEFAULT_DIFFICULTY,
  run: null,
  error: null,
  lastJoinCode: null,
  rttMs: null,
  inputDevice: initialDevice(),
  settingsOpen: false,
  setNickname(nickname) {
    set({ nickname });
    writeStored('local', NICKNAME_KEY, nickname);
  },
  setRoom(room) {
    set({ room, difficulty: room.difficulty, run: room.run });
  },
  clearRoom() {
    set({ room: null, run: null });
  },
  setScreen(screen) {
    set({ screen });
  },
  setError(error) {
    set({ error });
  },
  setInputDevice(device) {
    if (get().inputDevice !== device) {
      set({ inputDevice: device });
    }
  },
  setSettingsOpen(open) {
    set({ settingsOpen: open });
  },
}));

/** Whether this member plays or watches (S7-84): spectators are listed apart from the players. */
export function selfKind(room: RoomStateMessage | null, playerId: string | null): MemberKind {
  return room !== null && playerId !== null && room.spectators.some((s) => s.id === playerId)
    ? 'spectator'
    : 'player';
}

/** The newsroom this player belongs to; team 0 in co-op, for spectators and before a room. */
export function selfTeam(room: RoomStateMessage | null, playerId: string | null): TeamIndex {
  return room?.players.find((p) => p.id === playerId)?.team ?? 0;
}

/**
 * The players of one newsroom (S7-89): everyone in co-op, only that team in versus — each
 * newsroom plays its own copy of the level, so the other team's avatars are never drawn.
 */
export function newsroomPlayers(
  room: RoomStateMessage | null,
  team: TeamIndex,
): RoomStateMessage['players'] {
  if (!room) {
    return [];
  }
  return room.mode === 'versus'
    ? room.players.filter((player) => player.team === team)
    : room.players;
}
