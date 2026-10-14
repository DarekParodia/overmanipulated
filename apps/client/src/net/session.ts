// The single WebSocket session: join/create, reconnect with the slot token (survives reloads
// via sessionStorage and short app switches on phones), heartbeat RTT, and routing of server
// messages to the store, the game runtime and the feedback cues. Spectators (S7-84) get their own
// routing: their snapshots, events, stats and level ends go to the spectate store only.
import {
  type ClientMessage,
  type Difficulty,
  encodeMessage,
  type LevelEndMessage,
  type LobbyAction,
  type MemberKind,
  type PlayerCommand,
  PROTOCOL_VERSION,
  parseServerMessage,
  RECONNECT_GRACE_MS,
  type Role,
  type RoomStateMessage,
  type ServerMessage,
  type TeamIndex,
} from '@redakcja/shared';
import { useEvents } from '../events/event-store.ts';
import { emitCue, feedback } from '../fx/feedback.ts';
import { useGuidance } from '../guidance/store.ts';
import { playerBubbles } from '../pings/bubble-store.ts';
import { renderState } from '../scene/render-state.ts';
import { useRetryMemory } from '../stations/minigames/retry-memory.ts';
import { selfKind, selfTeam, useApp } from '../store/app.ts';
import { clientId } from '../store/client-id.ts';
import { useProfile } from '../store/profile.ts';
import { useProgress } from '../store/progress.ts';
import { readStored, writeStored } from '../store/safe-storage.ts';
import { useSettings } from '../store/settings.ts';
import { playerColor } from '../ui/tokens.ts';
import { reconnectDelayMs } from './backoff.ts';
import { type GameplayEvent, playerEvents, routeViewEvent } from './game-events.ts';
import { useGame } from './game-store.ts';
import { createGameView } from './game-view.ts';
import { createRuntime } from './runtime.ts';
import { useSpectate } from './spectate-store.ts';

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
let pendingJoin: { nickname: string; roomCode: string | null; as: MemberKind } | null = null;
let slot: StoredSlot | null = readSlot();
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectedAt: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let leaving = false;

export const runtime = createRuntime(
  () => useApp.getState().playerId,
  (message) => send(message),
  (command) => send({ type: 'command', command }),
);

/**
 * The local player's GameView (S7-85): this session's runtime and the module-level stores the
 * HUD reads too. The scene renders it whenever no other view is provided.
 */
export const playerView = createGameView({
  kind: 'player',
  team: 0,
  runtime,
  subjectId: () => useApp.getState().playerId,
  store: useGame,
  events: useEvents,
  bubbles: playerBubbles,
  guidance: useGuidance,
  render: renderState,
  feedback,
  bus: playerEvents,
});

/** Delivers a gameplay event to the player's view (listeners, then its cue). */
export function handleGameEvent(event: GameplayEvent): void {
  routeViewEvent(playerView, event);
}

function send(message: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(encodeMessage(message));
  }
}

function setSlot(next: StoredSlot | null): void {
  slot = next;
  writeStored('session', TOKEN_KEY, next ? JSON.stringify(next) : null);
}

function resetLevelState(levelId: string): void {
  runtime.reset(levelId);
  useGame.getState().reset();
}

/** Whether this client watches the room from the Widownia. */
function watching(): boolean {
  const { room, playerId } = useApp.getState();
  return selfKind(room, playerId) === 'spectator';
}

/** A team-tagged message for another newsroom than the player's own is not theirs to show. */
function otherTeam(team: TeamIndex | undefined): boolean {
  const { room, playerId } = useApp.getState();
  return team !== undefined && team !== selfTeam(room, playerId);
}

/** Moves a spectator between the lobby, the read-only briefing and the spectate screen. */
function routeSpectator(message: RoomStateMessage, previous: RoomStateMessage | null): void {
  const app = useApp.getState();
  if (message.phase === 'briefing' && app.screen !== 'briefing') {
    useSpectate.getState().reset();
    app.setScreen('briefing');
  } else if (
    (message.phase === 'playing' || message.phase === 'results') &&
    app.screen !== 'spectate'
  ) {
    // Already reset when the briefing began; joining mid-match arrives here directly.
    if (previous?.phase !== 'briefing') {
      useSpectate.getState().reset();
    }
    app.setScreen('spectate');
  } else if (message.phase === 'lobby' && app.screen !== 'lobby') {
    app.setScreen('lobby');
  }
}

function handleLevelEnd(message: LevelEndMessage): void {
  if (watching()) {
    useSpectate.getState().applyLevelEnd(message);
    return;
  }
  if (otherTeam(message.team)) {
    return;
  }
  useGame.getState().setLevelEnd(message);
  // A versus match is not a level played for progress (S7-80 writes no leaderboard either).
  if (!message.versus) {
    useProgress.getState().record(message.levelId, message.difficulty, message.stars);
  }
  // The profile counts versus matches too: `won` is then this newsroom's match result (S7-104).
  useProfile.getState().recordLevelEnd(message);
}

/** Removed by the host (S7-82): the slot is gone, so back to the menu with the reason. */
function handleKicked(): void {
  setSlot(null);
  closeSession();
  resetToMenu();
  useApp.setState({ connection: 'idle', error: 'kicked' });
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
      app.setRoom(message);
      if (selfKind(message, app.playerId) === 'spectator') {
        routeSpectator(message, previous);
      } else if (message.phase === 'briefing' && app.screen !== 'briefing') {
        // Topic of the day before the level (S3-03). Entering it (from the lobby or, on a
        // replay, from the results screen) drops the previous level's state once.
        resetLevelState(message.levelId);
        app.setScreen('briefing');
      } else if (message.phase === 'playing' && app.screen !== 'game') {
        // Already reset when the briefing began; a reload mid-level arrives here directly.
        if (previous?.phase !== 'briefing') {
          resetLevelState(message.levelId);
        }
        app.setScreen('game');
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
      if (watching()) {
        useSpectate.getState().applySnapshot(message, performance.now());
      } else if (!otherTeam(message.team)) {
        runtime.onSnapshot(message, performance.now());
        useGame.getState().applySnapshot(message);
      }
      return;
    case 'levelEnd':
      handleLevelEnd(message);
      return;
    case 'event': {
      // Spectators follow the match through `spectatorEvent` (embargoed in versus) only.
      if (watching() || otherTeam(message.team)) {
        return;
      }
      const { event } = message;
      if (event.kind === 'gameStarted') {
        // Kartoteka cards the player left in the last level do not come back (S7-14).
        useRetryMemory.getState().reset();
        useProfile.getState().startMatch();
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
      if (message.code === 'kicked') {
        handleKicked();
        return;
      }
      useApp.setState({ error: message.code });
      if (message.code === 'reconnectFailed') {
        setSlot(null);
        closeSession();
        useApp.setState({ connection: 'idle' });
      } else if (!app.playerId) {
        // A failed join leaves nothing to keep open; the menu must accept a retry.
        closeSession();
        useApp.setState({ connection: 'idle' });
      }
      return;
    case 'heartbeatAck':
      useApp.setState({ rttMs: Math.round(performance.now() - message.clientTime) });
      return;
    case 'spectatorEvent':
      // Never the player's stores or gameplay listeners: in versus it may hold a masked verdict.
      useSpectate.getState().applyEvent(message);
      return;
    case 'matchStats':
      useSpectate.getState().applyMatchStats(message);
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
        ...(pendingJoin.as === 'spectator' ? { as: 'spectator' as const } : {}),
        clientId: clientId(),
      });
    } else if (slot) {
      send({
        type: 'join',
        protocolVersion: PROTOCOL_VERSION,
        nickname: useApp.getState().nickname || 'Reporter',
        reconnectToken: slot.token,
        clientId: clientId(),
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
  useSpectate.getState().reset();
  useApp.getState().clearRoom();
  useApp.setState({ playerId: null, screen: 'mainMenu', rttMs: null });
}

/**
 * Creates a new room (no code) or joins one by code, as a player or as a spectator (S7-84). The
 * code is remembered, so a `matchInProgress` answer can offer to watch the same room.
 */
export function joinRoom(nickname: string, roomCode?: string, as: MemberKind = 'player'): void {
  setSlot(null);
  closeSession();
  leaving = false;
  disconnectedAt = null;
  reconnectAttempt = 0;
  useApp.setState({ error: null, lastJoinCode: roomCode ?? null });
  pendingJoin = { nickname, roomCode: roomCode ?? null, as };
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

/** Host, in the lobby: the room's difficulty for the next run (resets everyone's ready). */
export function setDifficulty(difficulty: Difficulty): void {
  lobby({ kind: 'setDifficulty', difficulty });
}

/** Briefing: this player has read it; the level starts when everyone has (or on time). */
export function skipBriefing(): void {
  lobby({ kind: 'skipBriefing' });
}

export function backToLobby(): void {
  lobby({ kind: 'backToLobby' });
}

/** Blunder-of-the-day vote on the results screen; a new vote replaces the old one. */
export function voteBlunder(storyId: string): void {
  lobby({ kind: 'voteBlunder', storyId });
}

/**
 * In-game menu (S7-10): asks the server to hold the level still while a solo player has the menu
 * open, or to resume it. The server refuses a pause whenever someone else is connected.
 */
export function setPaused(paused: boolean): void {
  lobby({ kind: 'setPaused', paused });
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

/** Tests only: feeds one server message through the routing above. */
export const receiveForTest = handleMessage;

// Dev aid (`?debug`): replay a server message, e.g. a `roomState` in the briefing phase before
// the server sends one, and send lobby actions from the console or a scripted playtest.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __session?: unknown }).__session = { receive: handleMessage, lobby };
  // Fire events and cues from the console or end-to-end tests.
  (window as unknown as { __fx?: unknown }).__fx = {
    handleGameEvent,
    emitCue,
    useGame,
    useApp,
    useSettings,
  };
}
