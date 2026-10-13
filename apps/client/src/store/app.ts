// Application state: current screen, session and the latest room state from the server.
import {
  DEFAULT_DIFFICULTY,
  type Difficulty,
  type ErrorCode,
  type RoomStateMessage,
  type RunSummary,
} from '@redakcja/shared';
import { create } from 'zustand';
import { readStored, writeStored } from './safe-storage.ts';

export type ScreenId = 'mainMenu' | 'lobby' | 'briefing' | 'game' | 'styleguide';
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
