// Lobby as a duty roster pinned to a cork board (design-rules §1): the room code on a typed
// card, today's edition on a briefing slip, each player on a typed strip with a coloured pin,
// their role and a "ready" stamp, and the press passes to pick a role from.
import { MAX_PLAYERS, type Role } from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import { requestMusic } from '../fx/audio/music.ts';
import { emitCue } from '../fx/feedback.ts';
import { leaveRoom, selectLevel, setReady, setRole, startGame } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { RoleIcon } from '../ui/icons/RoleIcon.tsx';
import { Stamp } from '../ui/Stamp.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import styles from './Lobby.module.css';
import { LevelCard } from './lobby/LevelCard.tsx';
import { ReadyToggle } from './lobby/ReadyToggle.tsx';
import { RolePasses } from './lobby/RolePasses.tsx';

/** Server errors a lobby action can answer with; shown next to the roster's actions. */
const LOBBY_ERRORS = new Set(['notReady', 'notHost', 'unknownLevel']);

/** Clears a previous lobby error before the next action, so a stale reason never lingers. */
function act(action: () => void): void {
  const { error } = useApp.getState();
  if (error && LOBBY_ERRORS.has(error)) {
    useApp.setState({ error: null });
  }
  action();
}

/** Plays the ready stamp when someone else signs the roster (own ticks cue on press). */
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
  const [copied, setCopied] = useState(false);
  useEffect(() => requestMusic('menu'), []);
  useRemoteReadyCue(playerId);

  if (!room) {
    return null;
  }
  const isHost = room.hostId === playerId;
  const me = room.players.find((p) => p.id === playerId);
  const empty = MAX_PLAYERS - room.players.length;
  const online = connection === 'online';
  // Start gate (the server enforces the same rule and answers `notReady`): every connected
  // guest must have signed the roster.
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
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the code is large enough to read aloud.
    }
  }

  return (
    <main className={styles.board}>
      <section className={styles.codeCard} aria-labelledby="room-code-label">
        <span className={styles.pin} aria-hidden="true" />
        <p id="room-code-label" className="label">
          {pl.lobby.codeLabel}
        </p>
        <p className={styles.code} data-testid="room-code">
          {room.roomCode}
        </p>
        <p className={styles.codeHint}>{pl.lobby.codeHint}</p>
        <Button variant="quiet" icon={<Icon name="copy" size={20} />} onClick={copyCode}>
          {copied ? pl.lobby.copied : pl.lobby.copy}
        </Button>
      </section>

      <section className={styles.roster} aria-labelledby="roster-title">
        <span className={styles.pin} aria-hidden="true" />
        <h1 id="roster-title" className={styles.rosterTitle}>
          {pl.lobby.boardTitle}
        </h1>
        <p className="label">{pl.lobby.playersCount(room.players.length, MAX_PLAYERS)}</p>
        <ol className={styles.strips}>
          {room.players.map((player, index) => (
            <li
              key={player.id}
              className={`${styles.strip} ${player.connected ? '' : styles.away}`}
              style={{ ['--tilt' as string]: `${((index * 37) % 5) - 2}deg` }}
            >
              <span
                className={styles.playerPin}
                style={{ background: playerColorVar(player.colorIndex) }}
                aria-hidden="true"
              >
                {player.colorIndex + 1}
              </span>
              <span className={styles.who}>
                <span className={styles.name}>{player.nickname}</span>
                <span
                  className={`${styles.role} ${player.role ? '' : styles.noRole}`}
                  data-testid="roster-role"
                >
                  <RoleIcon role={player.role ?? 'none'} size={18} />
                  {player.role ? pl.vocab.roles[player.role] : pl.lobbyRoles.noRole}
                </span>
              </span>
              <span className={styles.tags}>
                {player.id === playerId && <span className="label">{pl.lobby.you}</span>}
                {player.id === room.hostId && <span className="label">{pl.lobby.host}</span>}
                {!player.connected && (
                  <span className={`label ${styles.disconnected}`}>{pl.lobby.disconnected}</span>
                )}
              </span>
              <span className={styles.signoff}>
                {player.id === room.hostId ? null : player.ready ? (
                  <Stamp
                    text={pl.lobbyRoles.readyStamp}
                    tone="blue"
                    seed={player.colorIndex * 97 + 13}
                    slam
                    size={78}
                  />
                ) : (
                  <span className={styles.pending}>{pl.lobbyRoles.notReady}</span>
                )}
              </span>
            </li>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: empty desks have no identity.
            <li key={`empty-${i}`} className={`${styles.strip} ${styles.empty}`}>
              <span className={styles.name}>{pl.lobby.emptySlot}</span>
            </li>
          ))}
        </ol>
        <div className={styles.actions}>
          {isHost ? (
            <div className={styles.startBlock}>
              <Button
                variant="stamp"
                onClick={() => act(startGame)}
                disabled={!canStart}
                aria-describedby={startReason ? 'start-reason' : undefined}
              >
                {pl.lobby.start}
              </Button>
              {startReason && (
                <p id="start-reason" className={styles.reason} data-testid="start-reason">
                  {startReason}
                </p>
              )}
            </div>
          ) : (
            <div className={styles.startBlock}>
              <ReadyToggle
                ready={me?.ready ?? false}
                disabled={!online}
                onChange={(ready) => act(() => setReady(ready))}
              />
              <p className={styles.waiting}>{pl.lobby.waitingForHost}</p>
            </div>
          )}
          <Button variant="quiet" back icon={<Icon name="leave" size={20} />} onClick={leaveRoom}>
            {pl.lobby.leave}
          </Button>
        </div>
        {lobbyError && (
          <p className={styles.error} role="alert">
            {lobbyError}
          </p>
        )}
      </section>

      <div className={styles.level}>
        <LevelCard
          levelId={room.levelId}
          isHost={isHost}
          disabled={!online}
          onSelect={(levelId) => act(() => selectLevel(levelId))}
        />
      </div>

      <div className={styles.passes}>
        <RolePasses
          role={me?.role ?? null}
          disabled={!online}
          showEditorNote={noEditor && room.players.length > 1}
          onChange={(role: Role | null) => act(() => setRole(role))}
        />
      </div>
    </main>
  );
}
