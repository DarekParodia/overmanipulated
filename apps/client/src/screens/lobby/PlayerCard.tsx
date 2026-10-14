// One player in the lobby row: avatar circle in the player's colour, name, role (icon + name)
// and a big state chip — ✓ Gotowy / Czeka for guests, Gospodarz for the host. In the newsroom
// columns of Na punkty (S7-86) the card is a compact row: avatar, name and role icon, state chip
// (on a second line when the column is too narrow for the name). The name is always one line.
// The host sees a round „more” button next to another member's chip, for the manage sheet; the
// host's chip wears a crown that pops when the host role moves (S7-87). The player's accessory
// sits as a badge on the avatar, and the own card has a round „Zmień wygląd” button that opens the
// profile's look (S7-105).
import type { LobbyPlayer } from '@redakcja/shared';
import type { CSSProperties } from 'react';
import { pl } from '../../strings/pl.ts';
import { AccessoryIcon } from '../../ui/icons/AccessoryIcon.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import { RoleIcon } from '../../ui/icons/RoleIcon.tsx';
import { playerColorVar } from '../../ui/tokens.ts';
import { MoreButton } from './MoreButton.tsx';
import styles from './PlayerCard.module.css';

export type PlayerCardProps = {
  player: LobbyPlayer;
  isMe: boolean;
  isHost: boolean;
  /** One row instead of a tall card (the two newsroom columns, S7-86). */
  compact?: boolean;
  /** The host's „more” button for this member (S7-87); omitted for guests and the own card. */
  onManage?: (() => void) | undefined;
  manageDisabled?: boolean;
  /** The own card's „Zmień wygląd” button (S7-105): opens the profile. */
  onLook?: (() => void) | undefined;
};

export function PlayerCard({
  player,
  isMe,
  isHost,
  compact = false,
  onManage,
  manageDisabled = false,
  onLook,
}: PlayerCardProps) {
  const initial = player.nickname.trim().charAt(0).toLocaleUpperCase('pl-PL');
  return (
    <li
      className={`${styles.card} ${compact ? styles.compact : ''} ${isMe ? styles.me : ''} ${player.connected ? '' : styles.away}`}
      data-testid="player-card"
      data-player={player.nickname}
      data-color={player.colorIndex}
    >
      <span
        className={styles.avatar}
        style={{ background: playerColorVar(player.colorIndex) }}
        aria-hidden="true"
      >
        {initial}
        {player.accessory !== 'none' && (
          <span
            // A new look pops the badge in again (S7-105).
            key={`${player.accessory}-${player.colorIndex}`}
            className={styles.accessory}
            style={{ '--icon-fill': playerColorVar(player.colorIndex) } as CSSProperties}
            data-testid="player-accessory"
            data-accessory={player.accessory}
          >
            <AccessoryIcon accessory={player.accessory} size={20} />
          </span>
        )}
      </span>
      {player.accessory !== 'none' && (
        <span className="visually-hidden">{pl.profile.accessories[player.accessory]}</span>
      )}
      <span className={styles.who}>
        <span className={styles.name}>
          {/* One line: a long nickname ends in „…”; the text (its accessible name) and the
              tooltip keep it whole. */}
          <span className={styles.nameText} title={player.nickname} data-testid="player-name">
            {player.nickname}
          </span>
          {isMe && <span className={styles.you}>{pl.lobby.you}</span>}
        </span>
        <span className={`${styles.role} ${player.role ? '' : styles.noRole}`}>
          <RoleIcon role={player.role ?? 'none'} size={22} />
          <span data-testid="roster-role">
            {player.role ? pl.vocab.roles[player.role] : pl.lobbyRoles.noRole}
          </span>
        </span>
      </span>
      <span className={styles.foot}>
        {!player.connected ? (
          <span className={`${styles.state} ${styles.stateAway}`}>
            <Icon name="expired" size={22} />
            {pl.lobby.disconnected}
          </span>
        ) : isHost ? (
          <span className={`${styles.state} ${styles.stateHost}`} data-testid="host-chip">
            <Icon name="crown" size={22} className={`${styles.crown}`} />
            {pl.lobby.host}
          </span>
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
        {onLook && (
          <MoreButton
            label={pl.lobby.changeLook}
            testId="change-look"
            icon={<AccessoryIcon accessory="bowTie" size={24} />}
            onClick={onLook}
          />
        )}
        {onManage && (
          <MoreButton
            label={pl.manage.open(player.nickname)}
            disabled={manageDisabled}
            testId="member-options"
            onClick={onManage}
          />
        )}
      </span>
    </li>
  );
}
