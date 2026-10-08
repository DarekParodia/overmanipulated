// One story on the Kolegium: the outcome mark (slams on during the reveal), the headline, what
// the team decided next to the right verdict, the debrief in four short titled chunks, the
// stamps the team missed, and the blunder-of-the-day vote with a dot per voter.

import type { Verdict } from '@redakcja/shared';
import type { CSSProperties, PointerEvent } from 'react';
import { useRef } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { formatDelta } from '../hud/hud-model.ts';
import { KeyCap } from '../stations/kit.tsx';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import styles from './Debrief.module.css';
import type { DebriefCard as Card, Voter } from './debrief-model.ts';

const TONE = {
  correct: styles.good,
  wrongJustification: styles.caution,
  wrong: styles.bad,
  expired: styles.bad,
} as const;

const MARK = {
  correct: 'publish',
  wrongJustification: 'publish',
  wrong: 'reject',
  expired: 'expired',
} as const satisfies Record<Card['outcome'], IconName>;

const VERDICT_TONE: Record<Verdict, string | undefined> = {
  publish: styles.chipPublish,
  reject: styles.chipReject,
  publishWithContext: styles.chipContext,
};

const SECTIONS = [
  { key: 'what', icon: 'folder' },
  { key: 'technique', icon: 'lightbulb' },
  { key: 'tool', icon: 'stamp' },
  { key: 'realWorld', icon: 'globe' },
] as const satisfies readonly { key: keyof typeof pl.debrief.sections; icon: IconName }[];

/** Horizontal swipe distance that turns a page on phones. */
const SWIPE_PX = 56;

function VerdictChip({ verdict }: { verdict: Verdict | null }) {
  if (verdict === null) {
    return (
      <span className={`${styles.chip} ${styles.chipExpired}`}>
        <Icon name="expired" size={20} />
        {pl.debrief.expired}
      </span>
    );
  }
  return (
    <span className={`${styles.chip} ${VERDICT_TONE[verdict]}`}>
      <Icon name={verdict} size={20} />
      {pl.desk.verdictShort[verdict]}
    </span>
  );
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
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const headline = typeset(card.headline ?? pl.debrief.untitled);
  const titleId = `debrief-${card.folderId}`;

  const onPointerDown = (event: PointerEvent) => {
    swipeStart.current = { x: event.clientX, y: event.clientY };
    if (!current) {
      onSelect();
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || !onSwipe) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      onSwipe(dx < 0 ? 1 : -1);
    }
  };

  return (
    <article
      className={`${styles.card} ${TONE[card.outcome]} ${current ? styles.current : ''} ${instant ? styles.instant : ''}`}
      aria-labelledby={titleId}
      data-current={current || undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStart.current = null;
      }}
    >
      <header className={styles.head}>
        <span
          className={`${styles.mark} ${marked ? styles.markOn : styles.markOff}`}
          role="img"
          aria-label={pl.results.outcomes[card.outcome]}
        >
          <Icon name={MARK[card.outcome]} size={30} />
        </span>
        <div className={styles.headText}>
          <h3 id={titleId} className={styles.headline}>
            {headline}
          </h3>
          <p className={styles.outcome}>
            <span>{pl.results.outcomes[card.outcome]}</span>
            <span className={styles.points}>
              {pl.results.scoreDelta(formatDelta(card.scoreDelta))}
            </span>
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
                  <span
                    key={voter.playerId}
                    className={styles.dot}
                    style={{ '--dot': playerColorVar(voter.colorIndex) } as CSSProperties}
                  />
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

      {card.missedStamps.length > 0 && (
        <section className={styles.missed}>
          <h4 className={styles.sectionTitle}>
            <Icon name="stamp" size={22} />
            {pl.debrief.missed}
          </h4>
          <ul className={styles.missedList}>
            {card.missedStamps.map((stamp) => (
              <li key={stamp.id} className={styles.missedItem}>
                <Icon name={stamp.station} size={22} label={pl.vocab.stations[stamp.station]} />
                <span>{typeset(stamp.text)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
