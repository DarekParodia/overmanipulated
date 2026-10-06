// One card in the folder queue: story-type icon on a band in the priority colour, 1–3 flags
// for the priority (shape, not only colour), a big countdown and a small badge for where the
// folder is. No headline: the card is read in a glance. Under ten seconds the card turns red
// and shakes (no shake with reduced motion; nothing blinks).
import type { Folder } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './FolderQueue.module.css';
import { type GlyphName, HudGlyph } from './HudGlyph.tsx';
import {
  folderTimeLeftMs,
  formatClock,
  formatCountdown,
  isDeadlineWarning,
  type LocationKind,
} from './hud-model.ts';
import { hudStory } from './story-lookup.ts';

const FLAGS = { normal: 1, important: 2, urgent: 3 } as const;

const BADGE: Record<LocationKind, GlyphName | null> = {
  carried: 'hand',
  station: 'magnifier',
  desk: 'desk',
  waiting: null,
};

export function FolderCard({
  folder,
  elapsedMs,
  where,
  whereKind,
}: {
  folder: Folder;
  elapsedMs: number;
  where: string;
  whereKind: LocationKind;
}) {
  const story = hudStory(folder.storyId);
  const type = story?.type ?? 'article';
  const priority = story?.priority ?? 'normal';
  const left = folderTimeLeftMs(folder, elapsedMs);
  const warn = isDeadlineWarning(folder, elapsedMs);
  const badge = BADGE[whereKind];

  return (
    <li
      className={`${styles.card} ${styles[priority]} ${warn ? styles.warn : ''}`}
      data-folder={folder.id}
      data-warn={warn || undefined}
    >
      <div className={styles.band}>
        <Icon name={type} size={24} label={pl.vocab.storyTypes[type]} />
        <span className={styles.flags} role="img" aria-label={pl.vocab.priorities[priority]}>
          {Array.from({ length: FLAGS[priority] }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the flags are identical and positional
            <HudGlyph key={i} name="flag" size={16} fill="var(--surface)" />
          ))}
        </span>
      </div>
      <p
        className={styles.countdown}
        role="timer"
        aria-label={pl.hud.timeLeftLabel(formatClock(left))}
      >
        {formatCountdown(left)}
      </p>
      {badge ? (
        <span className={styles.badge} role="img" aria-label={where}>
          <HudGlyph name={badge} size={18} />
        </span>
      ) : (
        <span className="visually-hidden">{where}</span>
      )}
    </li>
  );
}
