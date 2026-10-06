// Application state: current screen, session and the latest room state from the server.
import type { ErrorCode, RoomStateMessage } from '@redakcja/shared';
import { create } from 'zustand';
import { readStored, writeStored } from './safe-storage.ts';

export type ScreenId = 'mainMenu' | 'lobby' | 'game' | 'styleguide';
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
  error: UiError | null;
  rttMs: number | null;
  inputDevice: InputDevice;
  settingsOpen: boolean;
  setNickname(nickname: string): void;
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
  error: null,
  rttMs: null,
  inputDevice: initialDevice(),
  settingsOpen: false,
  setNickname(nickname) {
    set({ nickname });
    writeStored('local', NICKNAME_KEY, nickname);
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
