// One card in the folder queue: story-type icon on a band in the priority colour, 1–3 flags
// for the priority (shape, not only colour), a big countdown and a small badge for where the
// folder is. No headline: the card is read in a glance. Under ten seconds the card turns red
// and shakes (no shake with reduced motion; nothing blinks). A multi-stamp folder also gets an
// evidence chip centred on its top edge (S7-19): proofs collected out of N, or only "×N".
import type { Folder } from '@redakcja/shared';
import type { TagBadge } from '../events/event-model.ts';
import { useGuidance } from '../guidance/store.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './FolderQueue.module.css';
import { type GlyphName, HudGlyph } from './HudGlyph.tsx';
import {
  type EvidenceBadge,
  evidenceBadge,
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
  tag = null,
}: {
  folder: Folder;
  elapsedMs: number;
  where: string;
  whereKind: LocationKind;
  /** Badge of the level event the folder belongs to (shares, boss call, raid, correction). */
  tag?: TagBadge | null;
}) {
  const story = hudStory(folder.storyId);
  const type = story?.type ?? 'article';
  const priority = story?.priority ?? 'normal';
  const left = folderTimeLeftMs(folder, elapsedMs);
  const warn = isDeadlineWarning(folder, elapsedMs);
  const badge = BADGE[whereKind];
  // The plain hints setting for now; S7-24 switches this to the effective-hints selector
  // (the setting AND `DIFFICULTY[room difficulty].hints`, so Ekspert shows only "×N").
  const hintsOn = useGuidance((s) => s.hintsEnabled);
  const evidence = evidenceBadge(folder, story, hintsOn);

  return (
    <li
      className={`${styles.card} ${styles[priority]} ${warn ? styles.warn : ''}`}
      data-folder={folder.id}
      data-warn={warn || undefined}
      data-tag={tag?.kind}
    >
      {tag && (
        <span
          className={`${styles.tag} ${styles[`tag_${tag.tone}`]} ${tag.urgent ? styles.tagUrgent : ''}`}
          role="img"
          aria-label={tag.label}
          data-testid={`folder-tag-${tag.kind}`}
        >
          <Icon name={tag.icon} size={18} />
          {tag.text && <span aria-hidden="true">{tag.text}</span>}
        </span>
      )}
      {evidence && <EvidenceChip evidence={evidence} />}
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

/** "1/2" (green once complete) with hints on, "×2" without; a stamp icon leads either way. */
function EvidenceChip({ evidence }: { evidence: EvidenceBadge }) {
  const { have, need } = evidence;
  const complete = have !== null && have >= need;
  return (
    <span
      className={`${styles.evidence} ${complete ? styles.evidenceDone : ''}`}
      role="img"
      aria-label={have === null ? pl.hud.evidenceNeed(need) : pl.hud.evidenceHave(have, need)}
      data-testid="folder-evidence"
      data-have={have ?? undefined}
      data-need={need}
    >
      <Icon name="stamp" size={16} />
      <span aria-hidden="true">
        {have === null ? pl.hud.evidenceShortNeed(need) : pl.hud.evidenceShortHave(have, need)}
      </span>
    </span>
  );
}
