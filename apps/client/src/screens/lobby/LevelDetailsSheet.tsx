// „Szczegóły” of the chosen level (S7-87), opened from the lobby's level card by everyone, guests
// included: minutes, folders (out of the bag's pool) and the room's difficulty; the stations with
// the purpose line of their help card (S7-15); the events with their banner icon and title; the
// star rule as shares of the maximum score, with the points once a run is dealt; the rule of the
// mode (versus, endless); and the best stars this browser earned on each difficulty. A native
// modal <dialog>: keyboard (Tab, Enter, Esc), gamepad (d-pad, A, B; the body scrolls with the
// focus) and touch; one yellow „Gotowe” closes it.
import { getLevel } from '@redakcja/content';
import { DIFFICULTIES, type Difficulty, type RoomMode, type RunSummary } from '@redakcja/shared';
import { useLayoutEffect, useRef } from 'react';
import { scrollTarget } from '../../about/model.ts';
import { EVENT_ICON } from '../../events/event-model.ts';
import { emitCue } from '../../fx/feedback.ts';
import { handleMenuIntent } from '../../input/menu-nav.ts';
import { useInputCapture, useNavIntent } from '../../input/ui-nav.ts';
import { STATION_ICON } from '../../stations/kit.tsx';
import { endlessBestOn, starsOn, useEndlessBest, useProgress } from '../../store/progress.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import { type LevelDetails, levelDetails, type StarRule } from './level-details.ts';
import styles from './Sheet.module.css';

const STAR_SLOTS = [0, 1, 2] as const;

export type LevelDetailsSheetProps = {
  open: boolean;
  levelId: string;
  mode: RoomMode;
  difficulty: Difficulty;
  /** `roomState.run`: the dealt run, or null in the lobby. */
  run: Pick<RunSummary, 'folders' | 'stars'> | null;
  onClose(): void;
};

export function LevelDetailsSheet({
  open,
  levelId,
  mode,
  difficulty,
  run,
  onClose,
}: LevelDetailsSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const level = getLevel(levelId);

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

  const details = level ? levelDetails(level, mode, difficulty, run) : null;
  const title = details?.endless ? pl.endless.title : (level?.title ?? levelId);
  return (
    <dialog
      ref={dialog}
      className={`${styles.dialog} ${styles.wide}`}
      onClose={onClose}
      onCancel={() => emitCue('ui.back')}
      aria-labelledby="level-details-title"
      data-testid="level-details"
      // Keys belong to the dialog: the lobby's own key handlers must not see them.
      onKeyDown={(event) => event.nativeEvent.stopPropagation()}
    >
      {open && (
        <DetailsSheet
          title={title}
          details={details}
          levelId={levelId}
          difficulty={difficulty}
          onClose={() => dialog.current?.close()}
        />
      )}
    </dialog>
  );
}

/**
 * The open sheet: a fixed header and footer around a scrolling body. The body takes the focus,
 * so the keyboard and the pad scroll it (up / down; at its end they move the focus on, B closes).
 */
function DetailsSheet({
  title,
  details,
  levelId,
  difficulty,
  onClose,
}: {
  title: string;
  details: LevelDetails | null;
  levelId: string;
  difficulty: Difficulty;
  onClose(): void;
}) {
  const body = useRef<HTMLElement>(null);
  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent === 'back') {
      emitCue('ui.back');
      onClose();
      return true;
    }
    const panel = body.current;
    if (panel && document.activeElement === panel && (intent === 'up' || intent === 'down')) {
      const top = scrollTarget(
        panel.scrollTop,
        panel.clientHeight,
        panel.scrollHeight,
        intent === 'down' ? 1 : -1,
      );
      if (top !== null) {
        panel.scrollTo({ top });
        return true;
      }
    }
    handleMenuIntent(intent);
    return true;
  });
  return (
    <div className={`panel ${styles.sheet} ${styles.scrolling}`}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.kicker}>{pl.levelDetails.kicker}</p>
          <h2 id="level-details-title" className={styles.title}>
            <Icon name={details?.endless ? 'infinity' : 'flag'} size={30} />
            {title}
          </h2>
        </div>
        <Button
          back
          icon={<Icon name="reject" size={24} label={pl.levelDetails.close} />}
          onClick={onClose}
        />
      </header>
      <section
        ref={body}
        className={styles.body}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling text panel takes the focus, so the keyboard and the pad can scroll it.
        tabIndex={0}
        aria-labelledby="level-details-title"
        data-testid="level-details-body"
      >
        {details && <DetailsBody details={details} levelId={levelId} difficulty={difficulty} />}
      </section>
      <footer className={styles.footer}>
        <Button
          variant="primary"
          icon={<Icon name="check" size={24} />}
          data-testid="level-details-close"
          onClick={onClose}
        >
          {pl.levelDetails.close}
        </Button>
      </footer>
    </div>
  );
}

function DetailsBody({
  details,
  levelId,
  difficulty,
}: {
  details: LevelDetails;
  levelId: string;
  difficulty: Difficulty;
}) {
  return (
    <>
      <p className={styles.chips}>
        {details.minutes !== null && (
          <span className={styles.chip}>
            <Icon name="clock" size={22} />
            {pl.lobbyRoles.levelMinutes(details.minutes)}
          </span>
        )}
        {details.endless && details.minutes === null && (
          <span className={styles.chip}>
            <Icon name="infinity" size={22} />
            {pl.endless.pitch}
          </span>
        )}
        {details.folders !== null && (
          <span className={styles.chip} data-testid="level-details-folders">
            <Icon name="article" size={22} />
            {pl.levelDetails.folders(details.folders)}
            {details.poolSize !== null && ` ${pl.levelDetails.pool(details.poolSize)}`}
          </span>
        )}
        <span className={styles.chip}>
          <Icon name="gauge" size={22} />
          {pl.difficulty.chip(pl.difficulty.names[difficulty])}
        </span>
      </p>

      <section className={styles.section} aria-labelledby="level-details-stations">
        <h3 id="level-details-stations" className={styles.sectionTitle}>
          <Icon name="desk" size={24} />
          {pl.levelDetails.stations}
        </h3>
        <ul className={styles.list} data-testid="level-details-stations">
          {details.stations.map((kind) => (
            <li key={kind} className={styles.item}>
              <Icon name={STATION_ICON[kind]} size={30} />
              <span className={styles.itemName}>{pl.vocab.stations[kind]}</span>
              <span className={styles.itemLine}>{typeset(pl.stationHelp.kinds[kind].purpose)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="level-details-events">
        <h3 id="level-details-events" className={styles.sectionTitle}>
          <Icon name="siren" size={24} />
          {pl.levelDetails.events}
        </h3>
        {details.events.length === 0 ? (
          <p className={styles.plain}>{pl.levelDetails.noEvents}</p>
        ) : (
          <ul className={styles.list} data-testid="level-details-events">
            {details.events.map((kind) => (
              <li key={kind} className={styles.item}>
                <Icon name={EVENT_ICON[kind]} size={30} />
                <span className={styles.itemName}>{pl.events.banner[kind].title}</span>
                <span className={styles.itemLine}>{typeset(pl.levelDetails.eventWhat[kind])}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {details.stars && <StarsSection rule={details.stars} />}

      {details.rule && (
        <section className={styles.section} aria-labelledby="level-details-rules">
          <h3 id="level-details-rules" className={styles.sectionTitle}>
            <Icon name={details.rule === 'endless' ? 'infinity' : 'trophy'} size={24} />
            {pl.levelDetails.rules}
          </h3>
          <p className={styles.plain} data-testid="level-details-rule">
            {typeset(ruleLine(details))}
          </p>
        </section>
      )}

      <BestSection endless={details.endless} levelId={levelId} difficulty={difficulty} />
    </>
  );
}

function ruleLine(details: LevelDetails): string {
  if (details.rule === 'versusEndless') {
    return `${pl.levelDetails.versusRule}. ${pl.levelDetails.versusEndless(details.minutes ?? 0)}.`;
  }
  if (details.rule === 'versus') {
    return `${pl.levelDetails.versusRule}.`;
  }
  return `${pl.levelDetails.endlessRule}.`;
}

function Stars({ count, label }: { count: number; label: string }) {
  return (
    <span className={styles.starIcons} role="img" aria-label={label}>
      {STAR_SLOTS.map((slot) => (
        <Icon
          key={slot}
          name="star"
          size={22}
          className={`${slot < count ? styles.starOn : styles.starOff}`}
        />
      ))}
    </span>
  );
}

function StarsSection({ rule }: { rule: StarRule }) {
  const rows = [
    { count: 1, text: pl.levelDetails.starOne, points: null },
    {
      count: 2,
      text: rule.sharePercent ? pl.levelDetails.starShare(rule.sharePercent.two) : null,
      points: rule.points?.two ?? null,
    },
    {
      count: 3,
      text: rule.sharePercent ? pl.levelDetails.starShare(rule.sharePercent.three) : null,
      points: rule.points?.three ?? null,
    },
  ];
  return (
    <section className={styles.section} aria-labelledby="level-details-stars">
      <h3 id="level-details-stars" className={styles.sectionTitle}>
        <Icon name="star" size={24} />
        {pl.levelDetails.stars}
      </h3>
      <ul className={styles.starRows} data-testid="level-details-stars">
        {rows.map((row) => (
          <li key={row.count} className={styles.starRow}>
            <Stars count={row.count} label={pl.levelDetails.starsLabel(row.count)} />
            {row.text && <span>{row.text}</span>}
            {row.points !== null && (
              <span className={styles.points}>{pl.levelDetails.starPoints(row.points)}</span>
            )}
          </li>
        ))}
      </ul>
      {rule.sharePercent && !rule.points && (
        <p className={styles.plain}>{typeset(pl.levelDetails.starsLater)}</p>
      )}
    </section>
  );
}

/** What this browser earned on the level, per difficulty (the room's marked). */
function BestSection({
  endless,
  levelId,
  difficulty,
}: {
  endless: boolean;
  levelId: string;
  difficulty: Difficulty;
}) {
  const progress = useProgress((s) => s.best);
  const endlessBest = useEndlessBest((s) => s.best);
  return (
    <section className={styles.section} aria-labelledby="level-details-best">
      <h3 id="level-details-best" className={styles.sectionTitle}>
        <Icon name="trophy" size={24} />
        {endless ? pl.levelDetails.bestEndless : pl.levelDetails.best}
      </h3>
      <ul className={styles.best} data-testid="level-details-best">
        {DIFFICULTIES.map((d) => {
          const name = pl.difficulty.names[d];
          const stars = starsOn(progress, d)[levelId] ?? 0;
          const score = endlessBestOn(endlessBest, d)?.score ?? null;
          return (
            <li
              key={d}
              className={`${styles.bestItem} ${d === difficulty ? styles.current : ''}`}
              data-difficulty={d}
            >
              <span>{name}</span>
              {endless ? (
                <span>
                  {score === null ? pl.levelDetails.bestNone : pl.levelDetails.starPoints(score)}
                </span>
              ) : (
                <Stars count={stars} label={pl.levelDetails.bestStarsLabel(name, stars)} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
