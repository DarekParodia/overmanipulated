// Folder queue, top-centre: the three most urgent folders as big cards, the rest summed up on
// a "+N" chip so no folder is ever silently hidden.
import { useMemo } from 'react';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { FolderCard } from './FolderCard.tsx';
import styles from './FolderQueue.module.css';
import { locationKind, locationLabel, sortQueue } from './hud-model.ts';
import { useLevelClock } from './use-level-clock.ts';

/** design-rules §1.3: the HUD shows at most three folders. */
const QUEUE_SHOWN = 3;

export function FolderQueue() {
  const folders = useGame((s) => s.folders);
  const players = useApp((s) => s.room?.players);
  const { elapsedMs } = useLevelClock();
  const queue = useMemo(() => sortQueue(folders), [folders]);
  const nicknameOf = (id: string) => players?.find((p) => p.id === id)?.nickname;
  const shown = queue.slice(0, QUEUE_SHOWN);
  const hidden = queue.length - shown.length;

  return (
    <section className={styles.queue} aria-label={pl.hud.queueLabel} data-testid="hud-queue">
      {queue.length === 0 ? (
        <p className={styles.empty}>{pl.hud.queueEmpty}</p>
      ) : (
        <ol className={styles.cards}>
          {shown.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              elapsedMs={elapsedMs}
              where={locationLabel(folder, nicknameOf)}
              whereKind={locationKind(folder)}
            />
          ))}
          {hidden > 0 && (
            <li className={styles.more} aria-label={pl.hud.queueMore(hidden)}>
              +{hidden}
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
