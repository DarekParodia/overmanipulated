// Editorial briefing before a level (S3-03, design doc §3): one newspaper card with the level,
// the topic of the day, up to three short lines, the stations new today, a countdown ring and
// who is ready. The card spins in and slaps onto the desk (a fade under reduced motion); any
// tap or key skips the intro. One main action: the yellow "Gotowy!".
import { getLevel, LEVELS } from '@redakcja/content';
import { BRIEFING_DURATION_MS, type StationKind } from '@redakcja/shared';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { requestMusic } from '../fx/audio/music.ts';
import { emitCue } from '../fx/feedback.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { skipBriefing } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { levelNumber, newStations } from '../store/progress.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import styles from './Briefing.module.css';

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const CONFIRM_KEYS = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyE']);

/** Seconds left until the level starts by itself, ticking locally from the server's value. */
function useCountdown(endsInMs: number | null, briefingKey: unknown): number | null {
  // A new briefing object from the server re-bases the local deadline.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-base on every server update.
  const deadline = useMemo(
    () => (endsInMs === null ? null : performance.now() + endsInMs),
    [endsInMs, briefingKey],
  );
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, deadline - now);
}

export function Briefing() {
  const room = useApp((s) => s.room);
  const playerId = useApp((s) => s.playerId);
  const [intro, setIntro] = useState(true);
  const [pressed, setPressed] = useState(false);
  const readyButton = useRef<HTMLDivElement>(null);
  const briefing = room?.briefing ?? null;
  const leftMs = useCountdown(briefing?.endsInMs ?? null, briefing);

  useEffect(() => requestMusic('menu'), []);
  useEffect(() => {
    emitCue('briefing.intro');
    // Fetch the 3D scene while the team reads, so the level opens without a loading screen.
    void import('./GameScreen.tsx');
  }, []);
  useEffect(() => {
    if (!intro) {
      readyButton.current?.querySelector('button')?.focus({ preventScroll: true });
    }
  }, [intro]);

  const skippedBy = briefing?.skippedBy ?? [];
  const isReady = pressed || (playerId !== null && skippedBy.includes(playerId));

  function finishIntro() {
    if (intro) {
      setIntro(false);
      emitCue('briefing.land');
    }
  }

  function ready() {
    if (isReady) {
      return;
    }
    finishIntro();
    setPressed(true);
    emitCue('briefing.ready');
    skipBriefing();
  }

  // Gamepad (and keyboard while captured): the first press ends the intro, the next is ready.
  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent === 'confirm') {
      intro ? finishIntro() : ready();
    } else if (intent === 'back' && intro) {
      finishIntro();
    }
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (intro) {
        event.preventDefault();
        finishIntro();
      } else if (
        CONFIRM_KEYS.has(event.code) &&
        !(event.target instanceof HTMLButtonElement) &&
        !event.repeat
      ) {
        event.preventDefault();
        ready();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!room) {
    return null;
  }
  const level = getLevel(room.levelId);
  const number = levelNumber(room.levelId);
  const training = number === 0;
  const fresh: StationKind[] = level ? newStations(level, LEVELS) : [];
  const points = level?.briefingPoints;
  const players = room.players.filter((p) => p.connected);
  const readyCount = players.filter((p) => skippedBy.includes(p.id)).length;
  const seconds = leftMs === null ? null : Math.ceil(leftMs / 1000);
  const ringStyle: CSSProperties | undefined =
    leftMs === null
      ? undefined
      : { strokeDashoffset: RING_LENGTH * (1 - leftMs / Math.max(leftMs, BRIEFING_DURATION_MS)) };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a tap anywhere only skips the intro.
    <main className={styles.page} onPointerDown={intro ? finishIntro : undefined}>
      <article
        className={`panel ${styles.card} ${intro ? styles.intro : ''}`}
        aria-labelledby="briefing-title"
        data-testid="briefing"
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            finishIntro();
          }
        }}
      >
        <header className={styles.head}>
          <p className={styles.kicker}>
            <span className={styles.levelChip}>
              {training ? pl.briefing.training : pl.briefing.levelNumber(number)}
            </span>
            <span className="visually-hidden">{pl.briefing.label}</span>
          </p>
          {seconds !== null && (
            <div
              className={styles.ring}
              role="timer"
              aria-label={pl.briefing.countdownLabel(seconds)}
            >
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle className={styles.ringTrack} cx="32" cy="32" r={RING_RADIUS} />
                <circle
                  className={styles.ringFill}
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  strokeDasharray={RING_LENGTH}
                  style={ringStyle}
                />
              </svg>
              <span
                className={`${styles.seconds} ${seconds >= 100 ? styles.secondsLong : ''}`}
                aria-hidden="true"
              >
                {seconds}
              </span>
            </div>
          )}
          <h1 id="briefing-title" className={styles.title}>
            {level?.title ?? room.levelId}
          </h1>
          {level?.topic && (
            <p className={styles.topic}>
              <span className={styles.topicLabel}>{pl.briefing.topic}</span> {typeset(level.topic)}
            </p>
          )}
        </header>

        {points ? (
          <ul className={styles.points}>
            {points.map((point) => (
              <li key={point}>
                <Icon name="arrow" size={22} />
                <span>{typeset(point)}</span>
              </li>
            ))}
          </ul>
        ) : (
          level && <p className={styles.text}>{typeset(level.briefing)}</p>
        )}

        {fresh.length > 0 && (
          <section className={styles.fresh} aria-labelledby="briefing-new">
            <h2 id="briefing-new" className={styles.freshTitle}>
              {pl.briefing.newToday}
            </h2>
            <ul className={styles.chips}>
              {fresh.map((station) => (
                <li key={station} className={styles.chip}>
                  <Icon name={station} size={26} />
                  {pl.vocab.stations[station]}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.foot}>
          <ul
            className={styles.dots}
            aria-label={pl.briefing.readyCount(readyCount, players.length)}
          >
            {players.map((player) => {
              const done = skippedBy.includes(player.id) || (player.id === playerId && isReady);
              return (
                <li
                  key={player.id}
                  className={`${styles.dot} ${done ? styles.dotReady : ''}`}
                  style={{ background: playerColorVar(player.colorIndex) }}
                  aria-label={
                    done
                      ? pl.briefing.playerReady(player.nickname)
                      : pl.briefing.playerWaiting(player.nickname)
                  }
                >
                  <span aria-hidden="true">
                    {player.nickname.trim().charAt(0).toLocaleUpperCase('pl-PL')}
                  </span>
                  {done && (
                    <span className={styles.dotCheck}>
                      <Icon name="check" size={16} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div ref={readyButton} className={styles.action}>
            {isReady ? (
              <p className={styles.waiting} role="status">
                <Icon name="check" size={26} />
                {pl.briefing.waiting}
              </p>
            ) : (
              <Button
                variant="primary"
                big
                icon={<Icon name="play" size={26} />}
                onClick={ready}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {pl.briefing.ready}
              </Button>
            )}
          </div>
        </footer>
      </article>
    </main>
  );
}
