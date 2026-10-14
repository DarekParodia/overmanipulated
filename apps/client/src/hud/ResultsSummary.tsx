// The results summary (S7-06): the three stars with what each one takes, how many points the
// next star still needs, why the thresholds are where they are, and the 'Za co punkty' table
// whose rows tick in with their points counting up. Desktop shows it as the left column; phones
// show it as the Kolegium's first page ('Podsumowanie'), with the lede the ribbon has no room
// for. Endless has no stars: only the figures and the table. Versus has no stars either: both
// newsrooms' cards, then this newsroom's table (S7-89).
import { CREDIBILITY_MAX } from '@redakcja/shared';
import type { ReactNode } from 'react';
import type {
  ResultTotals,
  StarProgress,
  TotalsRow,
  TotalsRowId,
} from '../debrief/results-model.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { HudGlyph } from './HudGlyph.tsx';
import { formatDelta, formatScore } from './hud-model.ts';
import { RatingStar } from './RatingStar.tsx';
import styles from './ResultsSummary.module.css';
import { useRolledNumber } from './use-rolled-number.ts';

/** Stars a level can earn. */
export const STAR_COUNT = 3;

const ROW_ICON = {
  correct: 'check',
  correction: 'siren',
  speed: 'bolt',
  proofs: 'stamp',
  bossCall: 'phone',
  weakProof: 'question',
  wrong: 'cross',
  expired: 'expired',
  unfinished: 'hourglass',
  other: 'folder',
} as const satisfies Record<TotalsRowId, IconName>;

/** How far the reveal has got: earned stars shown, progress line shown, totals rows shown. */
export type SummaryReveal = { stars: number; progress: boolean; rows: number; instant: boolean };

export type ResultsSummaryProps = {
  /** `column`: the desktop column; `page`: the phone Kolegium page with the lede. */
  variant: 'column' | 'page';
  lede: string;
  /** Null in endless (no stars). */
  progress: StarProgress | null;
  maxScore: number | null;
  totals: ResultTotals;
  /** The score and credibility figures (desktop column only). */
  figures?: ReactNode;
  /** Versus (S7-89): both newsrooms' cards, first in the column and under the phone page's lede. */
  teams?: ReactNode;
  reveal: SummaryReveal;
  /** Whether 'Skąd te progi?' starts open (keyboard and gamepad cannot open it). */
  explainOpen: boolean;
};

export function ResultsSummary({
  variant,
  lede,
  progress,
  maxScore,
  totals,
  figures,
  teams,
  reveal,
  explainOpen,
}: ResultsSummaryProps) {
  const page = variant === 'page';
  const why = progress?.shares && maxScore !== null && (
    <details className={styles.why} open={explainOpen}>
      <summary>
        <Icon name="question" size={20} />
        {pl.results.thresholdsWhyOpen}
      </summary>
      <p>
        {typeset(pl.results.thresholdsWhy(maxScore, progress.shares.two, progress.shares.three))}
      </p>
    </details>
  );
  const table = <TotalsTable totals={totals} shown={reveal.rows} instant={reveal.instant} />;
  return (
    <section
      className={`${styles.summary} ${page ? styles.page : styles.column} ${reveal.instant ? styles.instant : ''}`}
      aria-label={pl.results.summaryPage}
      data-testid={`results-summary-${variant}`}
    >
      {page ? (
        // Phones: two columns, so six rows and the total fit 640×360 — the lede, the progress
        // line, what each star takes and the explainer on the left, the table on the right.
        <>
          <div className={styles.pageSide}>
            <p className={styles.lede}>{typeset(lede)}</p>
            {teams}
            {progress && <ProgressLine progress={progress} shown={reveal.progress} />}
            {progress && <StarRule progress={progress} shown={reveal.stars} compact />}
            {why}
          </div>
          {table}
        </>
      ) : (
        <>
          {teams}
          {progress && (
            <>
              <StarRule progress={progress} shown={reveal.stars} compact={false} />
              <ProgressLine progress={progress} shown={reveal.progress} />
              {why}
            </>
          )}
          {figures}
          {table}
        </>
      )}
    </section>
  );
}

function starCaption(index: number, progress: StarProgress): string {
  if (index === 0) {
    return pl.results.starRule.one;
  }
  return pl.results.starRule.from(
    index === 1 ? progress.thresholds.two : progress.thresholds.three,
  );
}

/** The three stars, each with what it takes; `compact` is the phone page's list of small stars. */
function StarRule({
  progress,
  shown,
  compact,
}: {
  progress: StarProgress;
  shown: number;
  compact: boolean;
}) {
  return (
    <ol className={styles.stars} aria-label={pl.results.stars(progress.earned)}>
      {Array.from({ length: STAR_COUNT }, (_, i) => {
        const earned = i < progress.earned && shown > i;
        return (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: the three stars are positional
            key={i}
            className={`${styles.starCell} ${earned ? styles.starEarned : ''}`}
          >
            {compact ? (
              <StarGlyphs count={i + 1} earned={earned} />
            ) : (
              <RatingStar earned={earned} delayMs={0} />
            )}
            <span className={styles.starCaption}>{starCaption(i, progress)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** `count` small stars in a row: yellow when earned, grey otherwise. */
function StarGlyphs({ count, earned }: { count: number; earned: boolean }) {
  return (
    <span className={styles.glyphs} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <HudGlyph
          // biome-ignore lint/suspicious/noArrayIndexKey: identical glyphs
          key={i}
          name="star"
          size={16}
          fill={earned ? 'var(--yellow)' : 'var(--surface-sunk)'}
        />
      ))}
    </span>
  );
}

/** 'brakuje X pkt' to the next star, 'Komplet gwiazdek!' or 'Gwiazdki są tylko za wygraną'. */
function ProgressLine({ progress, shown }: { progress: StarProgress; shown: boolean }) {
  const { next } = progress;
  let stars = 0;
  let text: string = pl.results.starsNeedWin;
  let label: string = text;
  if (next) {
    stars = next.stars;
    text = pl.results.toNext(next.missing);
    label = pl.results.toNextLabel(next.stars, next.missing);
  } else if (progress.won) {
    // Won with no next star: the score is past the three-star threshold.
    stars = STAR_COUNT;
    text = pl.results.allStars;
    label = text;
  }
  return (
    <p
      className={`${styles.progress} ${shown ? styles.shown : styles.hidden}`}
      data-testid="results-progress"
    >
      {stars > 0 ? (
        <span className={styles.glyphs} aria-hidden>
          {Array.from({ length: stars }, (_, i) => (
            <HudGlyph
              // biome-ignore lint/suspicious/noArrayIndexKey: identical glyphs
              key={i}
              name="star"
              size={20}
              fill="var(--yellow)"
            />
          ))}
        </span>
      ) : (
        <Icon name="lock" size={20} />
      )}
      <span aria-hidden>{text}</span>
      <span className={styles.visuallyHidden}>{label}</span>
    </p>
  );
}

function TotalsTable({
  totals,
  shown,
  instant,
}: {
  totals: ResultTotals;
  shown: number;
  instant: boolean;
}) {
  const all = shown >= totals.rows.length;
  return (
    <div className={styles.totals}>
      <table className={styles.table} data-testid="results-totals">
        <caption className={styles.tableTitle}>{pl.results.totals.title}</caption>
        <thead className={styles.visuallyHidden}>
          <tr>
            <th scope="col">{pl.results.totals.what}</th>
            <th scope="col">{pl.results.totals.count}</th>
            <th scope="col">{pl.results.totals.points}</th>
            <th scope="col">{pl.results.totals.credibility}</th>
          </tr>
        </thead>
        <tbody>
          {totals.rows.map((row, index) => (
            <TotalsRowView key={row.id} row={row} shown={index < shown} instant={instant} />
          ))}
        </tbody>
        <tfoot className={all ? styles.shown : styles.hidden}>
          <tr>
            <th scope="row">{pl.results.totals.total}</th>
            <td />
            <td className={styles.points}>{formatScore(totals.points)}</td>
            <td className={styles.credibility}>
              <Credibility delta={totals.credibility} />
            </td>
          </tr>
        </tfoot>
      </table>
      <p className={`${styles.note} ${all ? styles.shown : styles.hidden}`}>
        {typeset(pl.results.totals.note(CREDIBILITY_MAX))}
      </p>
    </div>
  );
}

function TotalsRowView({
  row,
  shown,
  instant,
}: {
  row: TotalsRow;
  shown: boolean;
  instant: boolean;
}) {
  const points = useRolledNumber(shown ? row.points : 0, instant);
  return (
    <tr className={shown ? styles.shown : styles.hidden} data-row={row.id}>
      <th scope="row">
        <span className={styles.rowName}>
          <Icon name={ROW_ICON[row.id]} size={18} />
          {pl.results.totals.rows[row.id]}
        </span>
      </th>
      <td className={styles.count}>{row.count > 0 ? pl.results.totals.times(row.count) : ''}</td>
      <td className={styles.points}>{formatDelta(points)}</td>
      <td className={styles.credibility}>
        <Credibility delta={row.credibility} />
      </td>
    </tr>
  );
}

/** A credibility change with the shield glyph; nothing for 0. */
function Credibility({ delta }: { delta: number }) {
  if (delta === 0) {
    return null;
  }
  return (
    <span className={`${styles.shield} ${delta > 0 ? styles.up : styles.down}`}>
      <HudGlyph name="shield" size={16} fill={delta > 0 ? 'var(--green)' : 'var(--red)'} />
      {formatDelta(delta)}
    </span>
  );
}
