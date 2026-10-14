// One player in the lobby row: avatar circle in the player's colour, name, role (icon + name)
// and a big state chip — ✓ Gotowy / Czeka for guests, Gospodarz for the host. In the newsroom
// columns of Na punkty (S7-86) the card is a compact row: avatar, name and role icon, state chip.
import type { LobbyPlayer } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import { RoleIcon } from '../../ui/icons/RoleIcon.tsx';
import { playerColorVar } from '../../ui/tokens.ts';
import styles from './PlayerCard.module.css';

export type PlayerCardProps = {
  player: LobbyPlayer;
  isMe: boolean;
  isHost: boolean;
  /** One row instead of a tall card (the two newsroom columns, S7-86). */
  compact?: boolean;
};

export function PlayerCard({ player, isMe, isHost, compact = false }: PlayerCardProps) {
  const initial = player.nickname.trim().charAt(0).toLocaleUpperCase('pl-PL');
  return (
    <li
      className={`${styles.card} ${compact ? styles.compact : ''} ${isMe ? styles.me : ''} ${player.connected ? '' : styles.away}`}
      data-testid="player-card"
      data-player={player.nickname}
    >
      <span
        className={styles.avatar}
        style={{ background: playerColorVar(player.colorIndex) }}
        aria-hidden="true"
      >
        {initial}
      </span>
      <span className={styles.name}>
        {player.nickname}
        {isMe && <span className={styles.you}>{pl.lobby.you}</span>}
      </span>
      <span className={`${styles.role} ${player.role ? '' : styles.noRole}`}>
        <RoleIcon role={player.role ?? 'none'} size={22} />
        <span data-testid="roster-role">
          {player.role ? pl.vocab.roles[player.role] : pl.lobbyRoles.noRole}
        </span>
      </span>
      {!player.connected ? (
        <span className={`${styles.state} ${styles.stateAway}`}>
          <Icon name="expired" size={22} />
          {pl.lobby.disconnected}
        </span>
      ) : isHost ? (
        <span className={`${styles.state} ${styles.stateHost}`}>{pl.lobby.host}</span>
      ) : player.ready ? (
        <span className={`${styles.state} ${styles.stateReady}`}>
          <Icon name="publish" size={22} />
          {pl.lobbyRoles.readyState}
        </span>
      ) : (
        <span className={`${styles.state} ${styles.stateWaiting}`}>
          <Icon name="clock" size={22} />
          {pl.lobbyRoles.notReady}
        </span>
      )}
    </li>
  );
}
