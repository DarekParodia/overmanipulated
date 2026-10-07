// Room code and connection in a small secondary chip under the screen tools: useful to read
// out to a friend who dropped, never needed during play, so it stays out of the main HUD.
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import styles from './Hud.module.css';

export function RoomChip() {
  const roomCode = useApp((s) => s.room?.roomCode);
  const connection = useApp((s) => s.connection);
  const rtt = useApp((s) => s.rttMs);
  const online = connection === 'online';
  return (
    <p className={`${styles.roomChip} ${online ? '' : styles.roomChipOff}`}>
      {roomCode && <span className={styles.roomCode}>{pl.connection.room(roomCode)}</span>}
      <span className={styles.roomStatus} aria-live="polite">
        <span className={styles.roomDot} aria-hidden />
        {online && rtt !== null
          ? pl.game.ping(rtt)
          : pl.connection[connection === 'idle' ? 'offline' : connection]}
      </span>
    </p>
  );
}
