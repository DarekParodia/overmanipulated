// Lobby (design-rules §5): the room code big in a pill, the players as a row of cards, the
// role picker, the level, and one main action — "Gotowy" for guests, "Do składu!" for the host.
import { MAX_PLAYERS, type Role } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import { useEncyclopedia } from '../encyclopedia/store.ts';
import { LeaderboardDialog } from '../endless/LeaderboardDialog.tsx';
import { requestMusic } from '../fx/audio/music.ts';
import { emitCue } from '../fx/feedback.ts';
import { leaveRoom, selectLevel, setReady, setRole, startGame } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Lobby.module.css';
import { LevelCard } from './lobby/LevelCard.tsx';
import { PlayerCard } from './lobby/PlayerCard.tsx';
import { ReadyToggle } from './lobby/ReadyToggle.tsx';
import { RolePasses } from './lobby/RolePasses.tsx';

/** Server errors a lobby action can answer with; shown next to the main action. */
const LOBBY_ERRORS = new Set(['notReady', 'notHost', 'unknownLevel']);

/** Clears a previous lobby error before the next action, so a stale reason never lingers. */
function act(action: () => void): void {
  const { error } = useApp.getState();
  if (error && LOBBY_ERRORS.has(error)) {
    useApp.setState({ error: null });
  }
  action();
}

/** Plays the ready cue when someone else gets ready (own toggles cue on press). */
function useRemoteReadyCue(playerId: string | null): void {
  const players = useApp((s) => s.room?.players);
  const readyBefore = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ready = new Set((players ?? []).filter((p) => p.ready).map((p) => p.id));
    const before = readyBefore.current;
    readyBefore.current = ready;
    if (before && [...ready].some((id) => id !== playerId && !before.has(id))) {
      emitCue('lobby.ready');
    }
  }, [players, playerId]);
}

export function Lobby() {
  const room = useApp((s) => s.room);
  const playerId = useApp((s) => s.playerId);
  const connection = useApp((s) => s.connection);
  const error = useApp((s) => s.error);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const [copied, setCopied] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => requestMusic('menu'), []);
  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );
  useRemoteReadyCue(playerId);

  if (!room) {
    return null;
  }
  const isHost = room.hostId === playerId;
  const me = room.players.find((p) => p.id === playerId);
  const empty = MAX_PLAYERS - room.players.length;
  const online = connection === 'online';
  // Start gate (the server enforces the same rule and answers `notReady`): every connected
  // guest must be ready.
  const waitingFor = room.players
    .filter((p) => p.id !== room.hostId && p.connected && !p.ready)
    .map((p) => p.nickname);
  const canStart = online && waitingFor.length === 0;
  const startReason = !online
    ? pl.lobbyRoles.startOffline
    : waitingFor.length > 0
      ? pl.lobbyRoles.startWaiting(waitingFor)
      : room.players.length > 1
        ? pl.lobbyRoles.allReady
        : null;
  const lobbyError = error && LOBBY_ERRORS.has(error) ? pl.errors[error] : null;
  const noEditor = !room.players.some((p) => p.role === 'managingEditor');

  async function copyCode() {
    if (!room) {
      return;
    }
    try {
      await navigator.clipboard.writeText(room.roomCode);
      emitCue('ui.copy');
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the code is large enough to read aloud.
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <section className={styles.codePill} aria-labelledby="room-code-label">
          <span id="room-code-label" className={styles.codeLabel}>
            {pl.lobby.codeLabel}
          </span>
          <span className={styles.code} data-testid="room-code">
            {room.roomCode}
          </span>
          <Button
            icon={<Icon name={copied ? 'publish' : 'copy'} size={24} label={pl.lobby.copy} />}
            onClick={copyCode}
          />
          <span className="visually-hidden" aria-live="polite">
            {copied ? pl.lobby.copied : ''}
          </span>
        </section>
        <div className={styles.topActions}>
          <Button
            icon={<Icon name="settings" size={24} label={pl.lobby.settings} />}
            onClick={() => setSettingsOpen(true)}
          />
          <Button
            icon={<Icon name="book" size={24} />}
            data-testid="open-encyclopedia"
            onClick={() => useEncyclopedia.getState().show()}
          >
            {pl.encyclopedia.open}
          </Button>
          <Button icon={<Icon name="trophy" size={24} />} onClick={() => setBoardOpen(true)}>
            {pl.leaderboard.open}
          </Button>
          <Button back icon={<Icon name="leave" size={24} />} onClick={leaveRoom}>
            {pl.lobby.leave}
          </Button>
        </div>
      </header>
      <LeaderboardDialog
        open={boardOpen}
        roomCode={room.roomCode}
        onClose={() => setBoardOpen(false)}
      />

      <section className={styles.players} aria-labelledby="players-title">
        <h1 id="players-title" className={styles.sectionTitle}>
          {pl.lobby.playersCount(room.players.length, MAX_PLAYERS)}
        </h1>
        <ol className={styles.cards}>
          {room.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isMe={player.id === playerId}
              isHost={player.id === room.hostId}
            />
          ))}
          {Array.from({ length: empty }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: empty seats have no identity.
            <li key={`empty-${i}`} className={styles.emptySeat}>
              {pl.lobby.emptySlot}
            </li>
          ))}
        </ol>
      </section>

      <RolePasses
        role={me?.role ?? null}
        disabled={!online}
        showEditorNote={noEditor && room.players.length > 1}
        onChange={(role: Role | null) => act(() => setRole(role))}
      />

      <footer className={styles.bottom}>
        <LevelCard
          levelId={room.levelId}
          isHost={isHost}
          disabled={!online}
          onSelect={(levelId) => act(() => selectLevel(levelId))}
        />
        <div className={styles.action}>
          {isHost ? (
            <Button
              variant="primary"
              big
              onClick={() => act(startGame)}
              disabled={!canStart}
              aria-describedby={startReason ? 'start-reason' : undefined}
            >
              {pl.lobby.start}
            </Button>
          ) : (
            <ReadyToggle
              ready={me?.ready ?? false}
              disabled={!online}
              onChange={(ready) => act(() => setReady(ready))}
            />
          )}
          {isHost && startReason && (
            <p id="start-reason" className={styles.reason} data-testid="start-reason">
              {startReason}
            </p>
          )}
          {!isHost && me?.ready && <p className={styles.reason}>{pl.lobby.waitingForHost}</p>}
          {lobbyError && (
            <p className={styles.error} role="alert">
              {lobbyError}
            </p>
          )}
        </div>
      </footer>
    </main>
  );
}
