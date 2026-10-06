// The case file inside a folder, as the desk shows it: a typed form header (type, priority,
// case number), the headline and body set like copy, who sent it in and the deadline. Children
// are drawn on top of the sheet (the verdict stamp).
import type { Story } from '@redakcja/content';
import { DEADLINE_WARNING_MS, type Folder } from '@redakcja/shared';
import type { ReactNode } from 'react';
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './FolderSheet.module.css';
import { formatCountdown } from './overlay-logic.ts';

export type FolderSheetProps = {
  folder: Folder;
  story: Story;
  /** Hide the live deadline (e.g. once the verdict is in). */
  hideDeadline?: boolean;
  children?: ReactNode;
};

export function FolderSheet({ folder, story, hideDeadline = false, children }: FolderSheetProps) {
  return (
    <article className={styles.sheet} data-testid="folder-sheet">
      <dl className={styles.meta}>
        <div>
          <dt className="label">{pl.desk.type}</dt>
          <dd>
            <Icon name={story.type} size={18} />
            {pl.vocab.storyTypes[story.type]}
          </dd>
        </div>
        <div>
          <dt className="label">{pl.desk.priority}</dt>
          <dd className={styles[story.priority]}>{pl.vocab.priorities[story.priority]}</dd>
        </div>
        {!hideDeadline && (
          <div>
            <dt className="label">{pl.desk.deadline}</dt>
            <Deadline deadlineMs={folder.deadlineMs} />
          </div>
        )}
      </dl>
      <h2 className={styles.headline}>{typeset(story.headline)}</h2>
      <p className={styles.body}>{typeset(story.body)}</p>
      <p className={styles.source}>
        <span className="label">{pl.desk.source}</span> {typeset(story.source)}
      </p>
      {children}
    </article>
  );
}

function Deadline({ deadlineMs }: { deadlineMs: number }) {
  // Re-renders only when the shown value changes, not on every snapshot.
  const leftMs = useGame((s) => Math.ceil((deadlineMs - s.elapsedMs) / 1000) * 1000);
  const warning = leftMs <= DEADLINE_WARNING_MS;
  return (
    <dd className={`${styles.deadline} ${warning ? styles.warning : ''}`} data-testid="deadline">
      {leftMs <= 0 ? pl.desk.overdue : formatCountdown(leftMs)}
    </dd>
  );
}
