// Folder queue, top-centre: the most urgent folders as big cards (three, fewer when the band is
// narrow), the rest summed up on a "+N" chip so no folder is ever silently hidden. A free slot
// holds a dashed ghost card counting down to the next scheduled folder, or saying the belt is
// full (S7-09); an empty queue says it in words. When a folder gets more time (`cardHop`) its
// card hops (not with reduced motion). Deadline warnings already shake the card (CSS), and an
// expired folder leaves the queue with the next snapshot, so neither needs a motion here.
import { useMemo, useRef } from 'react';
import { abilityChipModel, abilityTargetFolder } from '../abilities/ability-model.ts';
import { useLocalAbility } from '../abilities/use-ability.ts';
import { raidSizes, tagBadge } from '../events/event-model.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { FolderCard } from './FolderCard.tsx';
import styles from './FolderQueue.module.css';
import {
  locationKind,
  locationLabel,
  type NextFolderState,
  nextFolderState,
  sortQueue,
} from './hud-model.ts';
import { playMotion, useHudTrigger } from './hud-motion.ts';
import { queueView, useQueueCapacity } from './queue-model.ts';
import { useLevelClock } from './use-level-clock.ts';

export function FolderQueue() {
  const folders = useGame((s) => s.folders);
  const nextFolder = useGame((s) => s.nextFolder);
  const conveyorFull = useGame((s) => s.conveyorFull);
  // Before the first snapshot nothing is known about the schedule yet.
  const started = useGame((s) => s.tick > 0);
  const players = useApp((s) => s.room?.players);
  const crew = useGame((s) => s.crew);
  // S7-40: the card a ready press would act on, and the folders a Ratownik's rescue covers.
  const local = useLocalAbility(runtime);
  const abilityTarget = abilityTargetFolder(
    abilityChipModel(local.preview, local.ability, local.elapsedMs),
  );
  const rescuers = useMemo(
    () => new Set(crew.filter((m) => m.rescuesLeft > 0).map((m) => m.id)),
    [crew],
  );
  const { elapsedMs } = useLevelClock();
  const queue = useMemo(() => sortQueue(folders), [folders]);
  const raids = useMemo(() => raidSizes(folders), [folders]);
  const nicknameOf = (id: string) => players?.find((p) => p.id === id)?.nickname;
  const section = useRef<HTMLElement>(null);
  const capacity = useQueueCapacity(section, queue.length);
  const next = nextFolderState(nextFolder, conveyorFull, elapsedMs);
  const view = queueView({
    ...capacity,
    sorted: queue,
    next: next.kind === 'in',
    full: next.kind === 'full',
  });

  useHudTrigger(['cardHop'], (_trigger, context, options) => {
    if (context.folderId) {
      // Only shown cards move; the rest sit on "+N".
      const selector = `[data-folder="${CSS.escape(context.folderId)}"]`;
      playMotion(section.current?.querySelector(selector), 'hop', options);
    }
  });

  return (
    <section
      ref={section}
      className={styles.queue}
      aria-label={pl.hud.queueLabel}
      data-testid="hud-queue"
      data-hud-band
    >
      {queue.length === 0 && view.ghost === null ? (
        <p className={styles.empty}>
          {started && next.kind === 'none' ? pl.hud.next.none : pl.hud.queueEmpty}
        </p>
      ) : (
        <ol className={styles.cards}>
          {view.shown.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              elapsedMs={elapsedMs}
              where={locationLabel(folder, nicknameOf)}
              whereKind={locationKind(folder)}
              tag={tagBadge(folder, elapsedMs, (raidId) => raids.get(raidId) ?? 1)}
              abilityTarget={folder.id === abilityTarget}
              rescue={folder.location.kind === 'carried' && rescuers.has(folder.location.playerId)}
            />
          ))}
          {view.ghost !== null && <GhostCard next={next} wide={queue.length === 0} />}
          {view.hidden > 0 && (
            <li className={styles.more} data-more aria-label={pl.hud.queueMore(view.hidden)}>
              +{view.hidden}
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

/**
 * The dashed ghost card: an hourglass and the seconds to the next scheduled folder, or an
 * orange band with the conveyor and 'Taśma pełna' while a due folder waits for a free tile.
 * `wide` (an empty queue) says it in words. The label is static: no per-second announcements.
 */
function GhostCard({ next, wide }: { next: NextFolderState; wide: boolean }) {
  const full = next.kind === 'full';
  const seconds = next.kind === 'in' ? Math.ceil(next.ms / 1000) : 0;
  const text = full
    ? pl.hud.next.full
    : wide
      ? pl.hud.next.emptyIn(seconds)
      : pl.hud.next.in(seconds);
  return (
    <li
      className={`${styles.card} ${styles.ghost} ${full ? styles.ghostFull : ''} ${wide ? styles.ghostWide : ''}`}
      data-testid="hud-next"
      data-state={full ? 'full' : 'in'}
      aria-label={full ? pl.hud.next.full : pl.hud.next.label}
    >
      <div className={styles.band} aria-hidden="true">
        <Icon name={full ? 'conveyor' : 'hourglass'} size={24} />
      </div>
      <p className={styles.ghostText} aria-hidden="true">
        {text}
      </p>
    </li>
  );
}
