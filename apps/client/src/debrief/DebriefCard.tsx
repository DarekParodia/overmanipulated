// One folder on the Kolegium (one story in endless): the outcome mark (slams on during the
// reveal; an hourglass for a folder still in play at the end), the headline, the result title by
// reason (the same `pl.outcome` title as the toast and the desk) with the points and credibility
// chips and '×N' for a grouped story, the one-line reason with its bonuses, what the team decided
// next to the right verdict, the debrief in four short titled chunks, the deciding proof and
// where it was (only when the folder did not end well), and the blunder-of-the-day vote with a
// dot per voter (votes are per story).

import type { Verdict } from '@redakcja/shared';
import type { PointerEvent } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { HudGlyph } from '../hud/HudGlyph.tsx';
import { formatDelta } from '../hud/hud-model.ts';
import { KeyCap } from '../stations/kit.tsx';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { VerdictStamp } from '../ui/VerdictStamp.tsx';
import { cardWhy } from './card-why.ts';
import styles from './Debrief.module.css';
import type { ProofStatus, Voter } from './debrief-model.ts';
import type { KolegiumCard as Card } from './results-model.ts';
import { useSwipe } from './use-swipe.ts';

const TONE = {
  correct: styles.good,
  wrongJustification: styles.caution,
  wrong: styles.bad,
  expired: styles.bad,
  unfinished: styles.caution,
} as const satisfies Record<Card['outcome'], string | undefined>;

const MARK = {
  correct: 'publish',
  wrongJustification: 'publish',
  wrong: 'reject',
  expired: 'expired',
  unfinished: 'hourglass',
} as const satisfies Record<Card['outcome'], IconName>;

const PROOF_TONE = {
  cited: styles.proofCited,
  collected: styles.proofCollected,
  missing: styles.proofMissing,
} as const satisfies Record<ProofStatus, string | undefined>;

const SECTIONS = [
  { key: 'what', icon: 'folder' },
  { key: 'technique', icon: 'lightbulb' },
  { key: 'tool', icon: 'stamp' },
  { key: 'realWorld', icon: 'globe' },
] as const satisfies readonly { key: keyof typeof pl.debrief.sections; icon: IconName }[];

function VerdictChip({ verdict }: { verdict: Verdict | null }) {
  if (verdict === null) {
    return <VerdictStamp kind="expired" size="sm" />;
  }
  return <VerdictStamp kind={verdict} size="sm" />;
}

export type DebriefCardProps = {
  card: Card;
  /** Mark already slammed on (or shown without animation). */
  marked: boolean;
  /** Skip the slam / pop animations. */
  instant: boolean;
  current: boolean;
  voters: readonly Voter[];
  votedByMe: boolean;
  leader: boolean;
  /** Key cap for the vote shortcut on the current card (keyboard / gamepad), or null. */
  voteKey: string | null;
  onVote(): void;
  onSelect(): void;
  /** Phones: swipe left / right turns the page. */
  onSwipe?(direction: -1 | 1): void;
};

export function DebriefCard({
  card,
  marked,
  instant,
  current,
  voters,
  votedByMe,
  leader,
  voteKey,
  onVote,
  onSelect,
  onSwipe,
}: DebriefCardProps) {
  const swipe = useSwipe(onSwipe);
  const headline = typeset(card.headline ?? pl.debrief.untitled);
  const titleId = `debrief-${card.folderId}`;

  const onPointerDown = (event: PointerEvent) => {
    swipe.onPointerDown(event);
    if (!current) {
      onSelect();
    }
  };

  return (
    <article
      className={`${styles.card} ${TONE[card.outcome]} ${current ? styles.current : ''} ${instant ? styles.instant : ''}`}
      aria-labelledby={titleId}
      data-testid="kolegium-card"
      data-outcome={card.outcome}
      data-count={card.count}
      data-points={card.scoreDelta}
      data-current={current || undefined}
      onPointerDown={onPointerDown}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerCancel}
    >
      <header className={styles.head}>
        <span
          className={`${styles.mark} ${marked ? styles.markOn : styles.markOff}`}
          role="img"
          aria-label={pl.outcome.group[card.outcome]}
        >
          <Icon name={MARK[card.outcome]} size={30} />
        </span>
        <div className={styles.headText}>
          <h3 id={titleId} className={styles.headline}>
            {headline}
          </h3>
          <p className={styles.outcome}>
            <span>{typeset(pl.outcome.title[card.reason])}</span>
            {card.count > 1 && (
              <span
                className={`${styles.chip} ${styles.repeats}`}
                role="img"
                aria-label={pl.debrief.repeatsLabel(card.count)}
                data-testid="kolegium-repeats"
              >
                {pl.debrief.repeats(card.count)}
              </span>
            )}
            <span className={`${styles.chip} ${styles.points}`}>
              <HudGlyph name="star" size={18} fill="var(--yellow)" />
              {pl.results.scoreDelta(formatDelta(card.scoreDelta))}
            </span>
            {card.credibilityDelta !== 0 && (
              <span
                className={`${styles.chip} ${card.credibilityDelta > 0 ? styles.credUp : styles.credDown}`}
                data-testid="kolegium-credibility"
              >
                <HudGlyph
                  name={card.credibilityDelta > 0 ? 'shield' : 'shieldCracked'}
                  size={18}
                  fill={card.credibilityDelta > 0 ? 'var(--green)' : 'var(--red)'}
                  label={pl.results.credibility}
                />
                {formatDelta(card.credibilityDelta)}
              </span>
            )}
          </p>
          <p className={styles.why} data-testid="kolegium-why">
            {typeset(cardWhy(card))}
          </p>
        </div>
        <div className={styles.voteRow}>
          <button
            type="button"
            className={styles.vote}
            aria-pressed={votedByMe}
            aria-label={pl.debrief.voteFor(headline)}
            onClick={() => {
              emitCue('debrief.vote');
              onVote();
            }}
          >
            <Icon name={votedByMe ? 'check' : 'blunder'} size={24} />
            <span className={styles.voteText}>
              {votedByMe ? pl.debrief.voted : pl.debrief.vote}
            </span>
            {voteKey && <KeyCap>{voteKey}</KeyCap>}
          </button>
          {voters.length > 0 && (
            <span className={styles.voters}>
              <span className={styles.dots} aria-hidden>
                {voters.map((voter) => (
                  <span key={voter.playerId} className={styles.dot}>
                    <PlayerMark colorIndex={voter.colorIndex} size="1.6rem" />
                  </span>
                ))}
              </span>
              <span className={styles.count}>{pl.debrief.votes(voters.length)}</span>
            </span>
          )}
          {leader && (
            <span className={styles.leader}>
              <Icon name="crown" size={22} />
              {pl.debrief.leader}
            </span>
          )}
        </div>
      </header>

      <dl className={styles.verdicts}>
        <div className={styles.verdictPair}>
          <dt>{pl.debrief.yourVerdict}</dt>
          <dd>
            <VerdictChip verdict={card.verdict} />
          </dd>
        </div>
        {card.correctVerdict && (
          <div className={styles.verdictPair}>
            <dt>{pl.debrief.correctVerdict}</dt>
            <dd>
              <VerdictChip verdict={card.correctVerdict} />
            </dd>
          </div>
        )}
      </dl>

      {card.debrief && (
        <div className={styles.sections}>
          {SECTIONS.map((section) => (
            <section key={section.key} className={styles.section}>
              <h4 className={styles.sectionTitle}>
                <Icon name={section.icon} size={22} />
                {pl.debrief.sections[section.key]}
              </h4>
              <p className={styles.sectionText}>{typeset(card.debrief?.[section.key] ?? '')}</p>
            </section>
          ))}
        </div>
      )}

      {card.proof && card.proof.length > 0 && (
        <section className={styles.missed} data-testid="kolegium-proof">
          <h4 className={styles.sectionTitle}>
            <Icon name="stamp" size={22} />
            {pl.debrief.proofTitle}
          </h4>
          <ul className={styles.missedList}>
            {card.proof.map((stamp) => (
              <li key={stamp.id} className={styles.missedItem} data-status={stamp.status}>
                <Icon name={stamp.station} size={22} label={pl.vocab.stations[stamp.station]} />
                <span>{typeset(stamp.text)}</span>
                <span className={`${styles.proofStatus} ${PROOF_TONE[stamp.status]}`}>
                  {pl.debrief.proofStatus[stamp.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
