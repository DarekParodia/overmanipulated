// Folder queue: one manila slip per folder pinned to a rail along the top edge, most urgent on
// the left. Each slip shows the story type (icon + label), priority (flag shape + label),
// countdown, where the folder is and how many stamps it has. Slips that don't fit are summed
// up on a "+N" tab, so no folder is ever silently hidden.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import styles from './FolderQueue.module.css';
import { FolderSlip } from './FolderSlip.tsx';
import { locationLabel, sortQueue } from './hud-model.ts';
import { useLevelClock } from './use-level-clock.ts';

/** Width of the "+N" tab (FolderQueue.module.css .more). */
const MORE_TAB_REM = 3;

export function FolderQueue() {
  const folders = useGame((s) => s.folders);
  const players = useApp((s) => s.room?.players);
  const { elapsedMs } = useLevelClock();
  const queue = useMemo(() => sortQueue(folders), [folders]);
  const nicknameOf = (id: string) => players?.find((p) => p.id === id)?.nickname;
  const section = useRef<HTMLElement>(null);
  const [fit, setFit] = useState({ all: Number.POSITIVE_INFINITY, withTab: 1 });
  const hasFolders = queue.length > 0;

  useLayoutEffect(() => {
    const element = section.current;
    if (!element || !hasFolders) {
      return;
    }
    const measure = () => {
      const list = element.querySelector('ol');
      const slip = list?.querySelector<HTMLElement>('li[data-folder]');
      if (!list || !slip) {
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const step = slip.offsetWidth + gap;
      const width = element.clientWidth + gap;
      setFit({
        all: Math.max(1, Math.floor(width / step)),
        withTab: Math.max(1, Math.floor((width - (MORE_TAB_REM * rem + gap)) / step)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasFolders]);

  // When some don't fit, the "+N" tab takes the end of the rail.
  const shown = queue.length > fit.all ? queue.slice(0, fit.withTab) : queue;
  const hidden = queue.length - shown.length;

  return (
    <section
      ref={section}
      className={styles.queue}
      aria-label={pl.hud.queueLabel}
      data-testid="hud-queue"
    >
      <span className={styles.rail} aria-hidden />
      {!hasFolders ? (
        <p className={styles.empty}>{pl.hud.queueEmpty}</p>
      ) : (
        <ol className={styles.slips}>
          {shown.map((folder) => (
            <FolderSlip
              key={folder.id}
              folder={folder}
              elapsedMs={elapsedMs}
              where={locationLabel(folder, nicknameOf)}
            />
          ))}
          {hidden > 0 && (
            <li className={styles.more}>
              <span className={styles.moreCount}>+{hidden}</span>
              <span className={styles.moreLabel}>{pl.hud.queueMore}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
