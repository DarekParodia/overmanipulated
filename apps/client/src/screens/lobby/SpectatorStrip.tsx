// The Widownia strip of the lobby (S7-86): „Widownia: n z 8” with an eye chip per spectator, the
// host's switch that opens it (closed by default) and the own move: „Na widownię” for a player
// who may watch instead, „Do gry” for a spectator host (a guest spectator gets „Do gry” as the
// footer's yellow action instead). Hidden while the server offers no spectators and nobody
// watches.
import { type LobbySpectator, MAX_SPECTATORS } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { Button } from '../../ui/Button.tsx';
import { Checkbox } from '../../ui/Checkbox.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './SpectatorStrip.module.css';

export type SpectatorStripProps = {
  spectators: readonly LobbySpectator[];
  spectatorsAllowed: boolean;
  selfId: string | null;
  isHost: boolean;
  /** The server's `spectators` feature flag. */
  featureOn: boolean;
  disabled: boolean;
  /** „Na widownię” for the local player, when the rules allow it. */
  canWatch: boolean;
  /** „Do gry” in the strip (a spectator host with a free seat). */
  canPlay: boolean;
  onAllowed(allowed: boolean): void;
  onWatch(): void;
  onPlay(): void;
};

export function SpectatorStrip({
  spectators,
  spectatorsAllowed,
  selfId,
  isHost,
  featureOn,
  disabled,
  canWatch,
  canPlay,
  onAllowed,
  onWatch,
  onPlay,
}: SpectatorStripProps) {
  if (!featureOn && spectators.length === 0) {
    return null;
  }
  return (
    <section
      className={styles.strip}
      aria-labelledby="spectators-title"
      data-testid="spectator-strip"
    >
      <h2 id="spectators-title" className={styles.title}>
        <Icon name="eye" size={24} />
        {pl.lobbyRoom.spectatorsTitle(spectators.length, MAX_SPECTATORS)}
      </h2>
      {isHost && featureOn ? (
        <div className={styles.toggle} data-testid="spectators-allowed">
          <Checkbox
            label={pl.lobbyRoom.spectatorsAllowed}
            checked={spectatorsAllowed}
            disabled={disabled}
            onChange={onAllowed}
          />
        </div>
      ) : (
        <span className={styles.state} data-testid="spectators-state">
          <Icon name={spectatorsAllowed ? 'eye' : 'lock'} size={20} />
          {spectatorsAllowed ? pl.lobbyRoom.spectatorsAllowed : pl.lobbyRoom.spectatorsClosed}
        </span>
      )}
      <ul className={styles.chips}>
        {spectators.length === 0 ? (
          <li className={styles.empty}>{pl.lobbyRoom.noSpectators}</li>
        ) : (
          spectators.map((spectator) => (
            <li
              key={spectator.id}
              className={`${styles.chip} ${spectator.connected ? '' : styles.away} ${spectator.id === selfId ? styles.me : ''}`}
              data-testid="spectator-chip"
            >
              <Icon name="eye" size={18} />
              {spectator.nickname}
              {spectator.id === selfId && <span className={styles.you}>{pl.lobby.you}</span>}
            </li>
          ))
        )}
      </ul>
      {canWatch && (
        <Button
          icon={<Icon name="eye" size={22} />}
          disabled={disabled}
          data-testid="to-spectators"
          onClick={onWatch}
        >
          {pl.lobbyRoom.toSpectators}
        </Button>
      )}
      {canPlay && (
        <Button
          icon={<Icon name="play" size={22} />}
          disabled={disabled}
          data-testid="to-players"
          onClick={onPlay}
        >
          {pl.lobbyRoom.toPlayers}
        </Button>
      )}
    </section>
  );
}
