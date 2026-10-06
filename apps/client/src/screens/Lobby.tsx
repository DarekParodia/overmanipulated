// Lobby as a duty roster pinned to a cork board (design-rules §1): the room code on a typed
// card, each player on a typed strip with a coloured pin.
import { MAX_PLAYERS } from '@redakcja/shared';
import { useEffect, useState } from 'react';
import { requestMusic } from '../fx/audio/music.ts';
import { emitCue } from '../fx/feedback.ts';
import { leaveRoom, startGame } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import styles from './Lobby.module.css';

export function Lobby() {
  const room = useApp((s) => s.room);
  const playerId = useApp((s) => s.playerId);
  const connection = useApp((s) => s.connection);
  const [copied, setCopied] = useState(false);
  useEffect(() => requestMusic('menu'), []);

  if (!room) {
    return null;
  }
  const isHost = room.hostId === playerId;
  const empty = MAX_PLAYERS - room.players.length;

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
              <span className={styles.name}>{player.nickname}</span>
              <span className={styles.tags}>
                {player.id === playerId && <span className="label">{pl.lobby.you}</span>}
                {player.id === room.hostId && <span className="label">{pl.lobby.host}</span>}
                {!player.connected && (
                  <span className={`label ${styles.disconnected}`}>{pl.lobby.disconnected}</span>
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
            <Button variant="stamp" onClick={startGame} disabled={connection !== 'online'}>
              {pl.lobby.start}
            </Button>
          ) : (
            <p className={styles.waiting}>{pl.lobby.waitingForHost}</p>
          )}
          <Button variant="quiet" back icon={<Icon name="leave" size={20} />} onClick={leaveRoom}>
            {pl.lobby.leave}
          </Button>
        </div>
      </section>
    </main>
  );
}
