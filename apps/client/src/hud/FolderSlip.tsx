// One pinned manila slip in the folder queue. Type and priority are each shown by a shape
// (icon, flag) and a label; colour only reinforces them. Near the deadline the slip trembles
// (motion only); with no-flash it gets a static red corner, with reduced motion it stays still.

import type { Folder } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './FolderQueue.module.css';
import { folderTimeLeftMs, formatClock, formatCountdown, isDeadlineWarning } from './hud-model.ts';
import { hudStory } from './story-lookup.ts';

/** Stamp ticks drawn on a slip; the count is always printed next to them too. */
const STAMP_TICKS_MAX = 4;

export function FolderSlip({
  folder,
  elapsedMs,
  where,
}: {
  folder: Folder;
  elapsedMs: number;
  where: string;
}) {
  const story = hudStory(folder.storyId);
  const type = story?.type ?? 'article';
  const priority = story?.priority ?? 'normal';
  const left = folderTimeLeftMs(folder, elapsedMs);
  const warn = isDeadlineWarning(folder, elapsedMs);
  const stamps = folder.stamps.length;

  return (
    <li
      className={`${styles.slip} ${styles[priority]} ${warn ? styles.warn : ''}`}
      data-folder={folder.id}
      data-warn={warn || undefined}
    >
      <span className={styles.pin} aria-hidden />
      <div className={styles.head}>
        <Icon name={type} size={20} label={pl.vocab.storyTypes[type]} />
        <span className={styles.priority}>{pl.vocab.priorities[priority]}</span>
        {priority !== 'normal' && (
          <span className={styles.flag} aria-hidden>
            {priority === 'urgent' ? '!!' : '!'}
          </span>
        )}
      </div>
      {story && <p className={styles.headline}>{story.headline}</p>}
      <p
        className={styles.countdown}
        role="timer"
        aria-label={pl.hud.timeLeftLabel(formatClock(left))}
      >
        {formatCountdown(left)}
      </p>
      <p className={styles.meta}>
        <span className={styles.where}>{where}</span>
        <span className={styles.stamps}>
          <span className={styles.ticks} aria-hidden>
            {Array.from({ length: Math.min(stamps, STAMP_TICKS_MAX) }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ticks are identical and positional
              <span key={i} className={styles.tick} />
            ))}
          </span>
          <span className={styles.stampCount}>{pl.hud.stamps(stamps)}</span>
        </span>
      </p>
    </li>
  );
}
