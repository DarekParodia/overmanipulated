// Results panel at the end of a level: a big won/lost headline on a green or red ribbon, three
// big stars, points and credibility, and a short list of folders with their fate. The host's
// yellow button takes the team back to the newsroom; guests see a waiting line. The full
// debrief (Kolegium) is Stage 3.
import type { LevelEndMessage } from '@redakcja/shared';
import { useEffect, useRef } from 'react';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { backToLobby, leaveRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { HudGlyph } from './HudGlyph.tsx';
import { formatScore } from './hud-model.ts';
import { RatingStar } from './RatingStar.tsx';
import { ResultRow } from './ResultRow.tsx';
import styles from './ResultsPlate.module.css';

const STAR_COUNT = 3;
const STAR_STAGGER_MS = 280;

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

  return (
    <div className={styles.backdrop}>
      <article
        className={`${styles.panel} ${levelEnd.won ? styles.won : styles.lost}`}
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

        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.stars} role="img" aria-label={pl.results.stars(levelEnd.stars)}>
              {Array.from({ length: STAR_COUNT }, (_, i) => (
                <RatingStar
                  // biome-ignore lint/suspicious/noArrayIndexKey: the three stars are positional
                  key={i}
                  earned={i < levelEnd.stars}
                  delayMs={i * STAR_STAGGER_MS}
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

          <section className={styles.list} aria-labelledby="results-folders">
            <h2 id="results-folders" className={styles.listTitle}>
              {pl.results.folders}
            </h2>
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
          <Button variant="ghost" back icon={<Icon name="leave" size={22} />} onClick={leaveRoom}>
            {pl.game.leave}
          </Button>
          {isHost ? (
            <Button variant="primary" big data-primary onClick={backToLobby}>
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
