// The folder card on the desk: chips for type, priority and deadline, then the headline, the
// story and who sent it in.
import type { Story } from '@redakcja/content';
import { DEADLINE_WARNING_MS, type Folder, type Priority } from '@redakcja/shared';
import { useGame } from '../net/game-store.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './FolderSheet.module.css';
import { formatCountdown } from './overlay-logic.ts';

export type FolderSheetProps = {
  folder: Folder;
  story: Story;
};

/** Priority is shown by colour and by the number of flags, never by colour alone. */
const PRIORITY_FLAGS: Record<Priority, number> = { normal: 1, important: 2, urgent: 3 };

export function FolderSheet({ folder, story }: FolderSheetProps) {
  return (
    <article className={styles.sheet} data-testid="folder-sheet">
      <div className={styles.chips}>
        <span className={styles.chip}>
          <Icon name={story.type} size={22} />
          {pl.vocab.storyTypes[story.type]}
        </span>
        <span className={`${styles.chip} ${styles[story.priority]}`}>
          <span className={styles.flags} aria-hidden="true">
            {Array.from({ length: PRIORITY_FLAGS[story.priority] }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed number of flags
              <span key={i} className={styles.flag} />
            ))}
          </span>
          {pl.vocab.priorities[story.priority]}
        </span>
        <Deadline deadlineMs={folder.deadlineMs} />
      </div>
      <h2 className={styles.headline}>{typeset(story.headline)}</h2>
      <p className={styles.body}>{typeset(story.body)}</p>
      <p className={styles.source}>
        {pl.desk.source} {typeset(story.source)}
      </p>
    </article>
  );
}

function Deadline({ deadlineMs }: { deadlineMs: number }) {
  // Re-renders only when the shown value changes, not on every snapshot.
  const leftMs = useGame((s) => Math.ceil((deadlineMs - s.elapsedMs) / 1000) * 1000);
  const warning = leftMs <= DEADLINE_WARNING_MS;
  return (
    <span
      className={`${styles.chip} ${styles.deadline} ${warning ? styles.warning : ''}`}
      data-testid="deadline"
    >
      <span className="visually-hidden">{pl.desk.deadline}:</span>
      <Icon name={leftMs <= 0 ? 'expired' : 'clock'} size={22} />
      {leftMs <= 0 ? pl.desk.overdue : formatCountdown(leftMs)}
    </span>
  );
}
