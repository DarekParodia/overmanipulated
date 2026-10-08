// Results screen at the end of a level: a big won/lost headline on a green or red ribbon, three
// big stars, points and credibility, and the Kolegium — one debrief card per story with the
// blunder-of-the-day vote. Stars and verdict marks reveal one by one with sound (any tap or key
// finishes the reveal). The host's yellow button takes the team back to the newsroom; guests
// see a waiting line.
import { getStory } from '@redakcja/content';
import type { LevelEndMessage } from '@redakcja/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { debriefCards } from '../debrief/debrief-model.ts';
import { Kolegium, useBlunderVotes } from '../debrief/Kolegium.tsx';
import { PHONE_QUERY, useMediaQuery } from '../debrief/use-media-query.ts';
import { revealTimes, useReveal } from '../debrief/use-reveal.ts';
import { emitCue } from '../fx/feedback.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { backToLobby, leaveRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { HudGlyph } from './HudGlyph.tsx';
import { formatScore } from './hud-model.ts';
import { RatingStar } from './RatingStar.tsx';
import styles from './ResultsPlate.module.css';
import { hudStory } from './story-lookup.ts';

const STAR_COUNT = 3;
const VOTE_KEY = { keyboard: 'Q', gamepad: 'Y', touch: null } as const;

/** Content story for the debrief; dev-fixture stories only have a headline. */
function debriefStory(storyId: string) {
  return getStory(storyId) ?? hudStory(storyId);
}

/** Mounted only while the level-end message is set, so it owns navigation only while shown. */
export function ResultsPlate({ levelEnd }: { levelEnd: LevelEndMessage }) {
  const isHost = useApp((s) => s.room !== null && s.room.hostId === s.playerId);
  const device = useApp((s) => s.inputDevice);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const paged = useMediaQuery(PHONE_QUERY);
  const footer = useRef<HTMLElement>(null);
  const cards = useMemo(() => debriefCards(levelEnd.results, debriefStory), [levelEnd.results]);
  const [current, setCurrent] = useState(0);
  const votes = useBlunderVotes();

  // Stars first, then the marks; on phones only the visible card's mark is part of the show.
  const markSteps = paged ? Math.min(1, cards.length) : cards.length;
  const times = useMemo(() => revealTimes(levelEnd.stars, markSteps), [levelEnd.stars, markSteps]);
  const reveal = useReveal(times, reducedMotion, (step) =>
    emitCue(step < levelEnd.stars ? 'debrief.star' : 'debrief.mark'),
  );
  const markShown = (index: number) => reveal.done || reveal.revealed > levelEnd.stars + index;

  // Any key finishes the reveal and does nothing else (so Enter can't skip the debrief).
  useEffect(() => {
    if (reveal.done) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      reveal.finish();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [reveal.done, reveal.finish]);

  const move = (delta: number) =>
    setCurrent((index) => Math.max(0, Math.min(cards.length - 1, index + delta)));

  useInputCapture(true);
  useNavIntent((intent) => {
    if (!reveal.done) {
      reveal.finish();
      return;
    }
    if (intent === 'confirm') {
      if (isHost) {
        backToLobby();
      }
    } else if (intent === 'left' || intent === 'up') {
      move(-1);
    } else if (intent === 'right' || intent === 'down') {
      move(1);
    } else if (intent === 'alt') {
      const card = cards[current];
      if (card) {
        emitCue('debrief.vote');
        votes.vote(card.storyId);
      }
    }
  });
  useEffect(() => {
    footer.current
      ?.querySelector<HTMLButtonElement>('[data-primary]')
      ?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.backdrop} onPointerDownCapture={reveal.done ? undefined : reveal.finish}>
      <article
        className={`${styles.panel} ${levelEnd.won ? styles.won : styles.lost} ${reveal.instant ? styles.instant : ''}`}
        data-testid="results"
        aria-labelledby="results-headline"
      >
        <header className={styles.ribbon}>
          <span className={styles.ribbonMark}>
            <Icon name={levelEnd.won ? 'publish' : 'reject'} size={30} />
          </span>
          <div>
            <h1 id="results-headline" className={styles.headline}>
              {levelEnd.won ? pl.results.wonHeadline : pl.results.lostHeadline}
            </h1>
            <p className={styles.lede}>
              {typeset(levelEnd.won ? pl.results.wonLede : pl.results.lostLede)}
            </p>
          </div>
        </header>

        <div className={styles.summary}>
          <div className={styles.stars} role="img" aria-label={pl.results.stars(levelEnd.stars)}>
            {Array.from({ length: STAR_COUNT }, (_, i) => (
              <RatingStar
                // biome-ignore lint/suspicious/noArrayIndexKey: the three stars are positional
                key={i}
                earned={i < levelEnd.stars && reveal.revealed > i}
                delayMs={0}
              />
            ))}
          </div>
          <dl className={styles.figures}>
            <div className={styles.figure}>
              <dt>
                <HudGlyph name="star" size={28} fill="var(--yellow)" label={pl.results.score} />
              </dt>
              <dd>{formatScore(levelEnd.score)}</dd>
            </div>
            <div className={styles.figure}>
              <dt>
                <HudGlyph
                  name="shield"
                  size={28}
                  fill="var(--green)"
                  label={pl.results.credibility}
                />
              </dt>
              <dd>{levelEnd.credibility}</dd>
            </div>
          </dl>
        </div>

        <section className={styles.kolegium} aria-labelledby="results-kolegium">
          <h2 id="results-kolegium" className={styles.kolegiumTitle}>
            {pl.debrief.title}
            {cards.length > 0 && (
              <span className={styles.kolegiumCount}>
                <Icon name="folder" size={20} />
                {pl.debrief.count(cards.length)}
              </span>
            )}
          </h2>
          <Kolegium
            cards={cards}
            paged={paged}
            current={Math.min(current, Math.max(0, cards.length - 1))}
            onCurrent={setCurrent}
            marked={markShown}
            instant={reveal.instant}
            voteKey={reveal.done ? VOTE_KEY[device] : null}
            votes={votes}
          />
        </section>

        <footer ref={footer} className={styles.footer}>
          <Button variant="ghost" back icon={<Icon name="leave" size={22} />} onClick={leaveRoom}>
            {pl.game.leave}
          </Button>
          {paged && cards.length > 1 && (
            <div className={styles.pager}>
              <button
                type="button"
                className={styles.pageButton}
                aria-label={pl.debrief.prev}
                disabled={current === 0}
                onClick={() => {
                  emitCue('ui.click');
                  move(-1);
                }}
              >
                <Icon name="arrow" size={24} style={{ transform: 'scaleX(-1)' }} />
              </button>
              <span className={styles.pagePosition} aria-live="polite">
                {pl.debrief.position(current + 1, cards.length)}
              </span>
              <button
                type="button"
                className={styles.pageButton}
                aria-label={pl.debrief.next}
                disabled={current >= cards.length - 1}
                onClick={() => {
                  emitCue('ui.click');
                  move(1);
                }}
              >
                <Icon name="arrow" size={24} />
              </button>
            </div>
          )}
          {isHost ? (
            <Button variant="primary" big={!paged} data-primary onClick={backToLobby}>
              {pl.results.backToLobby}
            </Button>
          ) : (
            <p className={styles.waiting} role="status">
              <Icon name="clock" size={24} />
              {pl.results.waitingForHost}
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
