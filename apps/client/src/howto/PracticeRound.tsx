// Practice round („Wypróbuj”, S7-97): a station's minigame played from its card in „Jak grać”,
// out of play. No server and no score: the story and seed come from `practiceStory` (the n-th
// story with this station's stamp, seed n + 1), the clock is the station overlay's
// (`useMinigameClock`, on Normal rules) and the outcome is only shown — „Udało się!” or „Nie tym
// razem”, then a yellow „Jeszcze raz” or „Wróć” to the card. This module must never import
// net/session.ts, so it cannot send a command (practice-model.test.ts walks its imports).
// Keyboard, gamepad and touch work as in a match: the „Jak grać” dialog hands its keys to the
// nav intents while a round runs, the frame takes `back` (and swallows the station help and the
// role ability), everything else goes to the minigame.
import { DEFAULT_DIFFICULTY, type StationKind } from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { attachInput } from '../input/input-manager.ts';
import { handleMenuIntent } from '../input/menu-nav.ts';
import { type NavIntent, subscribeNav, useInputCapture } from '../input/ui-nav.ts';
import { OutcomeBanner, STATION_ICON } from '../stations/kit.tsx';
import { minigameFor } from '../stations/minigames/index.ts';
import { useRetryMemory } from '../stations/minigames/retry-memory.ts';
import { roundRules } from '../stations/minigames/rules.ts';
import { OverlayFrame } from '../stations/OverlayFrame.tsx';
import { secondsLeft } from '../stations/overlay-logic.ts';
import { useMinigameClock } from '../stations/use-minigame-clock.ts';
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './PracticeRound.module.css';
import { practiceSeed, practiceStory } from './practice-model.ts';
import { useHowTo } from './store.ts';

export type PracticeRoundProps = {
  kind: StationKind;
  device: InputDevice;
};

export function PracticeRound({ kind, device }: PracticeRoundProps) {
  const setPractice = useHowTo((s) => s.setPractice);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  const [rules] = useState(() => roundRules(kind, DEFAULT_DIFFICULTY));
  const clock = useMinigameClock(rules.timeLimitMs, result !== null);
  const settled = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const story = practiceStory(kind, attempt);
  const seed = practiceSeed(attempt);
  const name = pl.vocab.stations[kind];

  useInputCapture(true);
  // Keys that land outside the dialog's own handler (nothing focused) still become intents.
  useEffect(() => attachInput(), []);
  useEffect(() => {
    emitCue('station.open');
  }, []);
  // The Kartoteka remembers circled fields per seed (retry-memory.ts); a practice card never
  // comes back, so its memory goes with the round.
  useEffect(() => () => useRetryMemory.getState().forget(seed), [seed]);
  useEffect(() => {
    setPractice(result === null ? 'playing' : 'result');
  }, [result, setPractice]);

  // A new round takes the focus, so the dialog's key handler gets the keys; the outcome puts it
  // on „Jeszcze raz”.
  useEffect(() => {
    if (result === null) {
      root.current?.focus({ preventScroll: true });
    } else {
      root.current
        ?.querySelector<HTMLElement>('[data-testid="practice-again"]')
        ?.focus({ preventScroll: true });
    }
  }, [result]);

  const finish = useCallback((success: boolean) => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    emitCue(success ? 'minigame.success' : 'minigame.fail');
    setResult(success);
  }, []);

  const exit = useCallback(() => setPractice('off'), [setPractice]);

  function again() {
    settled.current = false;
    setAttempt((n) => n + 1);
    setResult(null);
    clock.restart();
  }

  useEffect(() => {
    if (story && result === null && clock.remainingMs <= 0) {
      finish(false);
    }
  }, [story, result, clock.remainingMs, finish]);

  // The frame takes `back` (to the card) and swallows the station help and the role ability;
  // during a round the rest goes on to the minigame, on the outcome to the two buttons.
  const onIntent = useRef<(intent: NavIntent) => unknown>(() => false);
  onIntent.current = (intent) => {
    if (intent === 'back') {
      emitCue('ui.back');
      exit();
      return true;
    }
    if (result !== null) {
      handleMenuIntent(intent);
      return true;
    }
    return intent === 'help' || intent === 'ability';
  };
  // Subscribed again whenever a minigame mounts, so the frame stays the newest listener.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt and result re-subscribe on purpose
  useEffect(() => subscribeNav((intent) => onIntent.current(intent)), [attempt, result]);

  const Game = minigameFor(kind);
  return (
    <div
      ref={root}
      className={styles.root}
      tabIndex={-1}
      data-testid="practice"
      data-kind={kind}
      data-attempt={attempt}
      data-story={story?.id}
      data-state={result === null ? 'playing' : 'result'}
    >
      <OverlayFrame
        embedded
        title={name}
        icon={STATION_ICON[kind]}
        closeLabel={pl.howTo.practiceExit}
        backKey={pl.station.backKey[device]}
        onClose={exit}
        testId="practice-round"
        headerAction={
          <span className={styles.tag}>
            <Icon name="play" size={20} />
            {pl.howTo.practiceTag}
          </span>
        }
        time={
          story && result === null
            ? {
                left: 1 - clock.timeUsed,
                label: pl.station.timeLeft(secondsLeft(clock.remainingMs)),
                testId: 'practice-clock',
              }
            : undefined
        }
      >
        {!story ? (
          <p className={styles.empty}>{pl.station.unknownStory}</p>
        ) : result === null ? (
          <Game
            key={`${kind}-${attempt}`}
            seed={seed}
            folderId="practice"
            difficulty={rules.difficulty}
            timeLimitMs={rules.timeLimitMs}
            revealOnFail={rules.revealOnFail}
            story={story}
            stamp={story.stamps.find((stamp) => stamp.station === kind)}
            device={device}
            timeUsed={clock.timeUsed}
            onDone={finish}
          />
        ) : (
          <div className={styles.outcome} data-testid="practice-result" data-success={result}>
            <OutcomeBanner
              success={result}
              title={result ? pl.howTo.practiceDone : pl.howTo.practiceFailed}
            />
            <div className={styles.actions}>
              <Button
                variant="primary"
                big
                icon={<Icon name="retry" size={26} />}
                data-testid="practice-again"
                onClick={again}
              >
                {pl.howTo.again}
              </Button>
              <Button
                back
                icon={<Icon name="question" size={24} />}
                data-testid="practice-back"
                onClick={exit}
              >
                {pl.howTo.back}
              </Button>
            </div>
          </div>
        )}
      </OverlayFrame>
    </div>
  );
}
