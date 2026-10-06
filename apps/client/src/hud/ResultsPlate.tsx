// Level-end plate: tomorrow's front page. Masthead, a won/lost headline, the editor's rating as
// rubber-stamped stars, score and credibility, and the list of folders with their fate. The host
// takes the team back to the newsroom; guests wait. The full debrief (Kolegium) is Stage 3.
import { getLevel } from '@redakcja/content';
import type { LevelEndMessage } from '@redakcja/shared';
import { useEffect, useRef } from 'react';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { backToLobby, leaveRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { formatScore } from './hud-model.ts';
import { ResultRow } from './ResultRow.tsx';
import styles from './ResultsPlate.module.css';
import { StarStamp } from './StarStamp.tsx';

const STAR_COUNT = 3;
const STAR_STAGGER_MS = 320;

/** Mounted only while the level-end message is set, so it owns navigation only while shown. */
export function ResultsPlate({ levelEnd }: { levelEnd: LevelEndMessage }) {
  const isHost = useApp((s) => s.room !== null && s.room.hostId === s.playerId);
  const footer = useRef<HTMLElement>(null);

  useInputCapture(true);
  useNavIntent((intent) => {
    if (isHost && intent === 'confirm') {
      backToLobby();
    }
  });
  useEffect(() => {
    footer.current
      ?.querySelector<HTMLButtonElement>('[data-primary]')
      ?.focus({ preventScroll: true });
  }, []);

  const level = getLevel(levelEnd.levelId);
  return (
    <div className={styles.backdrop}>
      <article
        className={`${styles.page} ${levelEnd.won ? styles.won : styles.lost}`}
        data-testid="results"
        aria-labelledby="results-headline"
      >
        <header className={styles.masthead}>
          <span className={styles.kicker}>{pl.results.kicker}</span>
          <span className={styles.paper}>{pl.masthead.paper}</span>
          {level && <span className={styles.kicker}>{level.title}</span>}
        </header>

        <h1 id="results-headline" className={styles.headline}>
          {levelEnd.won ? pl.results.wonHeadline : pl.results.lostHeadline}
        </h1>
        <p className={styles.lede}>
          {typeset(levelEnd.won ? pl.results.wonLede : pl.results.lostLede)}
        </p>

        <div className={styles.columns}>
          <aside className={styles.rating}>
            <div className={styles.stars} role="img" aria-label={pl.results.stars(levelEnd.stars)}>
              {Array.from({ length: STAR_COUNT }, (_, i) => (
                <StarStamp
                  // biome-ignore lint/suspicious/noArrayIndexKey: the three stars are positional
                  key={i}
                  earned={i < levelEnd.stars}
                  seed={i * 7919 + 17}
                  delayMs={i * STAR_STAGGER_MS}
                />
              ))}
            </div>
            <p className={styles.starsLabel}>{pl.results.stars(levelEnd.stars)}</p>
            <dl className={styles.figures}>
              <div>
                <dt>{pl.results.score}</dt>
                <dd>{formatScore(levelEnd.score)}</dd>
              </div>
              <div>
                <dt>{pl.results.credibility}</dt>
                <dd>{levelEnd.credibility}</dd>
              </div>
            </dl>
          </aside>

          <section className={styles.list} aria-label={pl.results.folders}>
            <h2 className={styles.listTitle}>{pl.results.folders}</h2>
            {levelEnd.results.length === 0 ? (
              <p className={styles.empty}>{pl.results.noFolders}</p>
            ) : (
              <ol className={styles.rows}>
                {levelEnd.results.map((result) => (
                  <ResultRow key={result.folderId} result={result} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <footer ref={footer} className={styles.footer}>
          <Button variant="quiet" back onClick={leaveRoom}>
            {pl.game.leave}
          </Button>
          {isHost ? (
            <Button variant="stamp" data-primary onClick={backToLobby}>
              {pl.results.backToLobby}
            </Button>
          ) : (
            <p className={styles.waiting} role="status">
              {pl.results.waitingForHost}
            </p>
          )}
        </footer>
      </article>
    </div>
  );
}
