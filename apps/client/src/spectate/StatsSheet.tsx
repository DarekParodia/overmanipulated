// The Widownia's stats sheet (S7-91): a native modal <dialog> sliding in from the right
// (min(420 px, 40 vw); the whole screen on phones) with each newsroom's per-player counters from
// the 1 Hz `matchStats`. Opened by „Statystyki”, Q or Y; closed by its ✗, Esc or B (the dialog
// scope of the menu navigation). Beside a live view (not on a phone) it may hold the spectator
// ad unit at its bottom, away from every control; AdSlot itself decides whether ads are on.
import type { LobbyPlayer, TeamIndex } from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { AdSlot } from '../ads/AdSlot.tsx';
import { emitCue } from '../fx/feedback.ts';
import { useSpectate } from '../net/spectate-store.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './SpectatePanels.module.css';
import { StatsTables } from './StatsTables.tsx';
import { statsTeams } from './stats-model.ts';

const NO_PLAYERS: readonly LobbyPlayer[] = [];

export function StatsSheet({
  open,
  teams,
  versus,
  side,
  onClose,
}: {
  open: boolean;
  teams: readonly TeamIndex[];
  versus: boolean;
  /** A side sheet beside the views (not a phone's full-screen one): it may hold the ad. */
  side: boolean;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const roster = useApp((s) => s.room?.players ?? NO_PLAYERS);
  const stats = useSpectate((s) => s.matchStats?.players);
  const pending = useSpectate((s) => s.pending);
  const groups = useMemo(
    () => statsTeams(teams, roster, stats ?? [], pending),
    [teams, roster, stats, pending],
  );

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.statsDialog}
      onClose={onClose}
      // Esc closes natively; it gets the same back sound as B and the ✗.
      onCancel={() => emitCue('ui.back')}
      aria-labelledby="spectate-stats-title"
      data-testid="spectate-stats"
    >
      {open && (
        <div className={styles.statsSheet}>
          <header className={styles.statsHeader}>
            <h2 id="spectate-stats-title" className={styles.statsTitle}>
              <Icon name="gauge" size={26} />
              {pl.spectate.stats.title}
            </h2>
            <Button
              back
              icon={<Icon name="close" size={24} label={pl.spectate.stats.close} />}
              data-testid="spectate-stats-close"
              onClick={() => dialog.current?.close()}
            />
          </header>
          <StatsTables groups={groups} versus={versus} />
          {side && <AdSlot placement="spectator" className={styles.sheetAd} />}
        </div>
      )}
    </dialog>
  );
}
