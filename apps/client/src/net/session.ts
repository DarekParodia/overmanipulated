// The single WebSocket session: join/create, reconnect with the slot token (survives reloads
// via sessionStorage and short app switches on phones), heartbeat RTT, and routing of server
// messages to the store, the game runtime and the feedback cues.
import {
  type ClientMessage,
  encodeMessage,
  type LobbyAction,
  type PlayerCommand,
  PROTOCOL_VERSION,
  parseServerMessage,
  RECONNECT_GRACE_MS,
  type Role,
  type ServerMessage,
} from '@redakcja/shared';
import { emitCue } from '../fx/feedback.ts';
import { useApp } from '../store/app.ts';
import { readStored, writeStored } from '../store/safe-storage.ts';
import { playerColor } from '../ui/tokens.ts';
import { reconnectDelayMs } from './backoff.ts';
import { handleGameEvent } from './game-events.ts';
import { useGame } from './game-store.ts';
import { createRuntime } from './runtime.ts';

const TOKEN_KEY = 'redakcja.reconnect';
const HEARTBEAT_MS = 2000;

type StoredSlot = { token: string; roomCode: string };

function readSlot(): StoredSlot | null {
  const raw = readStored('session', TOKEN_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSlot>;
    return typeof parsed.token === 'string' && typeof parsed.roomCode === 'string'
      ? { token: parsed.token, roomCode: parsed.roomCode }
      : null;
  } catch {
    return null;
  }
}

function socketUrl(): string {
  const { protocol, host } = window.location;
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
}

let socket: WebSocket | null = null;
/** A fresh join to send on the next open; null means resume `slot` instead. */
let pendingJoin: { nickname: string; roomCode: string | null } | null = null;
let slot: StoredSlot | null = readSlot();
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectedAt: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let leaving = false;

export const runtime = createRuntime(
  () => useApp.getState().playerId,
  (message) => send(message),
);

function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(encodeMessage(message));
  }
}

function setSlot(next: StoredSlot | null): void {
  slot = next;
  writeStored('session', TOKEN_KEY, next ? JSON.stringify(next) : null);
}

function handleMessage(message: ServerMessage): void {
  const app = useApp.getState();
  switch (message.type) {
    case 'welcome':
      setSlot({ token: message.reconnectToken, roomCode: message.roomCode });
      reconnectAttempt = 0;
      disconnectedAt = null;
      useApp.setState({ playerId: message.playerId, connection: 'online', error: null });
      return;
    case 'roomState': {
      const previous = app.room;
      useApp.setState({ room: message });
      if (message.phase === 'playing' && app.screen !== 'game') {
        runtime.reset(message.levelId);
        useGame.getState().reset();
        app.setScreen('game');
      } else if (message.phase === 'playing' && previous?.phase === 'results') {
        // A new level started straight from the results screen.
        runtime.reset(message.levelId);
        useGame.getState().reset();
      } else if (message.phase === 'lobby' && app.screen !== 'lobby') {
        app.setScreen('lobby');
      }
      if (previous && message.phase === 'lobby') {
        const before = new Set(previous.players.map((p) => p.id));
        if (message.players.some((p) => !before.has(p.id))) {
          emitCue('player.join');
        }
      }
      return;
    }
    case 'snapshot':
      runtime.onSnapshot(message, performance.now());
      useGame.getState().applySnapshot(message);
      return;
    case 'levelEnd':
      useGame.getState().setLevelEnd(message);
      return;
    case 'event': {
      const { event } = message;
      if (event.kind === 'gameStarted') {
        emitCue('game.start');
        return;
      }
      if (useApp.getState().screen !== 'game') {
        return;
      }
      if (
        event.kind !== 'playerJoined' &&
        event.kind !== 'playerLeft' &&
        event.kind !== 'playerReconnected'
      ) {
        handleGameEvent(event);
        return;
      }
      const snapshot = runtime.buffer.latest();
      const player = snapshot?.players.find((p) => p.id === event.playerId);
      const colorIndex =
        useApp.getState().room?.players.find((p) => p.id === event.playerId)?.colorIndex ?? 0;
      const context = {
        playerId: event.playerId,
        color: playerColor(colorIndex),
        ...(player ? { position: { x: player.x, y: player.y } } : {}),
      };
      if (event.kind === 'playerJoined') {
        emitCue('player.join', context);
      } else if (event.kind === 'playerReconnected') {
        emitCue('player.reconnect', context);
      } else if (event.kind === 'playerLeft') {
        emitCue('player.leave', context);
      }
      return;
    }
    case 'error':
      useApp.setState({ error: message.code });
      if (message.code === 'reconnectFailed') {
        setSlot(null);
        closeSession();
      } else if (!app.playerId) {
        // A failed join leaves nothing to keep open.
        closeSession();
      }
      return;
    case 'heartbeatAck':
      useApp.setState({ rttMs: Math.round(performance.now() - message.clientTime) });
      return;
  }
}

function open(): void {
  clearReconnect();
  const ws = new WebSocket(socketUrl());
  socket = ws;
  useApp.setState({ connection: disconnectedAt === null ? 'connecting' : 'reconnecting' });

  ws.addEventListener('open', () => {
    if (socket !== ws) {
      return;
    }
    if (pendingJoin) {
      send({
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: pendingJoin.nickname,
        ...(pendingJoin.roomCode ? { roomCode: pendingJoin.roomCode } : {}),
      });
    } else if (slot) {
      send({
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: useApp.getState().nickname || 'Reporter',
        reconnectToken: slot.token,
      });
    }
    pendingJoin = null;
    startHeartbeat();
  });

  ws.addEventListener('message', (event) => {
    if (socket !== ws || typeof event.data !== 'string') {
      return;
    }
    const parsed = parseServerMessage(event.data);
    if (parsed.ok) {
      handleMessage(parsed.message);
    }
  });

  ws.addEventListener('close', () => {
    if (socket !== ws) {
      return;
    }
    socket = null;
    stopHeartbeat();
    if (leaving || !slot) {
      leaving = false;
      if (useApp.getState().connection !== 'idle') {
        useApp.setState({ connection: 'idle' });
      }
      return;
    }
    disconnectedAt ??= performance.now();
    if (performance.now() - disconnectedAt > RECONNECT_GRACE_MS) {
      setSlot(null);
      useApp.setState({ connection: 'offline', error: 'connectionLost' });
      resetToMenu();
      return;
    }
    useApp.setState({ connection: 'reconnecting' });
    reconnectTimer = setTimeout(open, reconnectDelayMs(reconnectAttempt++));
  });
}

function startHeartbeat(): void {
  stopHeartbeat();
  const beat = () => send({ type: 'heartbeat', clientTime: performance.now() });
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function clearReconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeSession(): void {
  clearReconnect();
  stopHeartbeat();
  leaving = true;
  socket?.close(1000);
  socket = null;
}

function resetToMenu(): void {
  runtime.reset();
  useApp.setState({ playerId: null, room: null, screen: 'mainMenu', rttMs: null });
}

/** Creates a new room (no code) or joins one by code. */
export function joinRoom(nickname: string, roomCode?: string): void {
  setSlot(null);
  closeSession();
  leaving = false;
  disconnectedAt = null;
  reconnectAttempt = 0;
  useApp.setState({ error: null });
  pendingJoin = { nickname, roomCode: roomCode ?? null };
  open();
}

/** Leaves on purpose: the server frees the slot immediately. */
export function leaveRoom(): void {
  setSlot(null);
  closeSession();
  useApp.setState({ connection: 'idle' });
  resetToMenu();
}

function lobby(action: LobbyAction): void {
  send({ type: 'lobby', action });
}

export function startGame(): void {
  lobby({ kind: 'start' });
}

export function setRole(role: Role | null): void {
  lobby({ kind: 'setRole', role });
}

export function setReady(ready: boolean): void {
  lobby({ kind: 'setReady', ready });
}

export function selectLevel(levelId: string): void {
  lobby({ kind: 'selectLevel', levelId });
}

export function backToLobby(): void {
  lobby({ kind: 'backToLobby' });
}

/** Blunder-of-the-day vote on the results screen; a new vote replaces the old one. */
export function voteBlunder(storyId: string): void {
  lobby({ kind: 'voteBlunder', storyId });
}

/** Sends a player decision (minigame result, verdict, ping, …); applied on the next tick. */
export function sendCommand(command: PlayerCommand): void {
  send({ type: 'command', command });
}

/** On load: resume a slot from this tab's previous page (reload) if there is one. */
export function resumeIfPossible(): boolean {
  if (!slot) {
    return false;
  }
  disconnectedAt = performance.now();
  open();
  return true;
}

/** Phones kill sockets in the background; reconnect right away when the tab returns. */
export function handleVisibilityReturn(): void {
  if (document.visibilityState === 'visible' && slot && !socket) {
    reconnectAttempt = 0;
    open();
  }
}
