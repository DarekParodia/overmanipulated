// Station overlay (S2-03): hosts the minigame for the station the local player operates, enforces
// the time limit and reports the outcome to the server exactly once. Also the two small plates
// shown around it: the hold-to-work ring while working, and the lockout plate after a failure.
// A station that keeps its card (the Kartoteka, MINIGAME_STABLE_SEED_STATIONS) starts a round
// that follows a cancel with the clock that was left (S7-14, retry-memory.ts). The room's
// difficulty sets the time limit and whether a failure shows the answer (S7-24, rules.ts).
// The first time this browser opens a station, its help card covers the minigame, which starts
// only when the card is closed; the '?' in the header (H / Select) brings the card back. While
// the card is up the client clock stands still and the card takes every nav intent (S7-95). The
// server's folder deadline keeps running, and the card says so.
import { getStory } from '@redakcja/content';
import {
  type Folder,
  MINIGAME_STABLE_SEED_STATIONS,
  ROLE_PERKS,
  type Station,
} from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { type NavIntent, subscribeNav, useInputCapture } from '../input/ui-nav.ts';
import { sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { KeyCap, ResultMark, STATION_ICON } from './kit.tsx';
import { minigameFor } from './minigames/index.ts';
import { recallCard, roundClockMs, useRetryMemory } from './minigames/retry-memory.ts';
import { roundRules } from './minigames/rules.ts';
import { OverlayFrame } from './OverlayFrame.tsx';
import { secondsLeft } from './overlay-logic.ts';
import { StationHelpCard } from './StationHelpCard.tsx';
import styles from './StationOverlay.module.css';
import { markStationHelpSeen, stationHelpSeen } from './station-help-store.ts';
import { useMinigameClock } from './use-minigame-clock.ts';

export type StationOverlayProps = {
  station: Station;
  /** The folder lying on the station, if the snapshot has it. */
  folder: Folder | undefined;
  /** Called once the result was sent (true = success). */
  onResult(success: boolean): void;
  /** Called after the player closed the overlay (cancel was sent). */
  onClose(): void;
};

export function StationOverlay({ station, folder, onResult, onClose }: StationOverlayProps) {
  const device = useApp((s) => s.inputDevice);
  const role = useApp((s) => s.room?.players.find((p) => p.id === s.playerId)?.role);
  const skipsQueue = role ? ROLE_PERKS[role].skipsPhoneQueue : false;
  const story = folder ? getStory(folder.storyId) : undefined;
  const seed = station.minigameSeed;
  const keepsCard = MINIGAME_STABLE_SEED_STATIONS.includes(station.kind);
  const difficulty = useApp((s) => s.difficulty);
  // Read once per round: StationLayer unmounts the overlay whenever the station leaves the
  // minigame phase, so a Kartoteka retry (same seed, same key) still mounts afresh.
  const [rules] = useState(() => roundRules(station.kind, difficulty));
  const limitMs = rules.timeLimitMs;
  // A Kartoteka card put down unfinished resumes with the clock it had (S7-14).
  const [resumeMs] = useState(() => {
    const entry = keepsCard ? recallCard(seed) : undefined;
    const resumed = entry !== undefined && entry.remainingMs !== null;
    return resumed ? roundClockMs(entry, limitMs) : undefined;
  });
  // First use: the help card is up and the minigame waits for „Rozumiem”.
  const [helpOpen, setHelpOpen] = useState(() => !stationHelpSeen(station.kind));
  const [gameStarted, setGameStarted] = useState(!helpOpen);
  const helpOpenRef = useRef(helpOpen);
  helpOpenRef.current = helpOpen;
  const clock = useMinigameClock(limitMs, helpOpen, resumeMs);
  const settled = useRef(false);
  const playable = story !== undefined;

  useInputCapture(true);
  useEffect(() => {
    emitCue('station.open');
  }, []);
  useEffect(() => {
    markStationHelpSeen(station.kind);
  }, [station.kind]);

  const openHelp = useCallback(() => {
    // Set at once, so an intent that arrives before the next render already goes to the card.
    helpOpenRef.current = true;
    setHelpOpen(true);
  }, []);
  const closeHelp = useCallback(() => {
    if (!helpOpenRef.current) {
      return;
    }
    helpOpenRef.current = false;
    setHelpOpen(false);
    setGameStarted(true);
  }, []);

  const finish = useCallback(
    (success: boolean) => {
      if (settled.current) {
        return;
      }
      settled.current = true;
      if (keepsCard && !success) {
        // The card comes back after the lockout with its circles but a full clock.
        useRetryMemory.getState().rememberFailure(seed);
      }
      sendCommand({ kind: 'minigameResult', stationId: station.id, success });
      // Failure feedback comes with the server's minigameFailed event (net/game-events.ts).
      if (success) {
        emitCue('minigame.success');
      }
      onResult(success);
    },
    [station.id, keepsCard, seed, onResult],
  );

  const { readRemaining } = clock;
  const close = useCallback(() => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    if (keepsCard && playable && gameStarted) {
      // Putting the card down keeps the clock where it was: no fresh time for a peek.
      useRetryMemory.getState().rememberCancel(seed, readRemaining());
    }
    sendCommand({ kind: 'cancel' });
    onClose();
  }, [keepsCard, playable, gameStarted, readRemaining, seed, onClose]);

  useEffect(() => {
    if (playable && clock.remainingMs <= 0) {
      finish(false);
    }
  }, [playable, clock.remainingMs, finish]);

  // The frame takes `back` and `help`; everything else goes on to the minigame inside. While
  // the help card is up it takes every intent: confirm, back and help close the card (never the
  // station), the rest does nothing.
  const onIntent = useRef<(intent: NavIntent) => unknown>(() => false);
  onIntent.current = (intent) => {
    if (helpOpenRef.current) {
      if (intent === 'confirm' || intent === 'back' || intent === 'help') {
        emitCue(intent === 'back' ? 'ui.back' : 'ui.click');
        closeHelp();
      }
      return true;
    }
    if (intent === 'help') {
      emitCue('ui.click');
      openHelp();
      return true;
    }
    if (intent !== 'back') {
      return false;
    }
    emitCue('ui.back');
    close();
    return true;
  };
  // Subscribed again once the minigame mounts (after the first-use card), so the frame stays
  // the newest listener and sees every intent before the minigame does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: gameStarted re-subscribes on purpose
  useEffect(() => subscribeNav((intent) => onIntent.current(intent)), [gameStarted]);

  const Game = minigameFor(station.kind);
  const timeLeft = clock.remainingMs;
  // Shares of the full limit, so a resumed round shows the clock as it was left.
  const timeUsed = clock.timeUsed;
  const name = pl.vocab.stations[station.kind];

  return (
    <OverlayFrame
      title={name}
      icon={STATION_ICON[station.kind]}
      closeLabel={pl.station.leave}
      backKey={pl.station.backKey[device]}
      onClose={close}
      testId="station-overlay"
      help={
        helpOpen
          ? undefined
          : {
              onOpen: openHelp,
              label: pl.stationHelp.openLabel(name),
              keyCap: pl.stationHelp.key[device],
            }
      }
      cover={
        helpOpen ? (
          <StationHelpCard
            kind={station.kind}
            device={device}
            focusGot={device !== 'touch'}
            onClose={closeHelp}
          />
        ) : undefined
      }
      time={
        playable
          ? {
              left: 1 - timeUsed,
              label: pl.station.timeLeft(secondsLeft(timeLeft)),
              testId: 'station-clock',
            }
          : undefined
      }
    >
      {!gameStarted ? null : story ? (
        <Game
          seed={seed}
          folderId={folder?.id ?? ''}
          difficulty={rules.difficulty}
          timeLimitMs={limitMs}
          revealOnFail={rules.revealOnFail}
          {...(resumeMs === undefined ? {} : { resumeMs })}
          story={story}
          stamp={story.stamps.find((s) => s.station === station.kind)}
          device={device}
          skipsQueue={skipsQueue}
          timeUsed={timeUsed}
          onDone={finish}
        />
      ) : (
        <p className={styles.empty}>{folder ? pl.station.unknownStory : pl.station.noFolder}</p>
      )}
    </OverlayFrame>
  );
}

/** Ring geometry for the work prompt (SVG units). */
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

/** While the player holds the work button: a big progress ring and "Hold [key]". */
export function WorkPrompt({ station }: { station: Station }) {
  const device = useApp((s) => s.inputDevice);
  const progress =
    station.durationMs > 0 ? Math.min(1, station.progressMs / station.durationMs) : 0;
  return (
    <div className={`panel ${styles.plate}`} role="status" data-testid="work-prompt">
      <span
        className={styles.ring}
        role="progressbar"
        aria-label={pl.vocab.stations[station.kind]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle className={styles.ringTrack} cx={32} cy={32} r={RING_R} />
          <circle
            className={styles.ringFill}
            cx={32}
            cy={32}
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - progress)}
          />
        </svg>
        <span className={styles.ringIcon}>
          <Icon name={STATION_ICON[station.kind]} size={26} />
        </span>
      </span>
      <span className={styles.plateText}>
        {device === 'touch' ? (
          <span>{pl.station.holdTouch}</span>
        ) : (
          <>
            <span>{pl.station.hold}</span>
            <KeyCap>{pl.station.workKey[device]}</KeyCap>
          </>
        )}
      </span>
    </div>
  );
}

/** "Missed, wait" plate after a lost minigame; disappears when the lockout runs out. */
export function LockoutNote({ until, onDone }: { until: number; onDone(): void }) {
  const [now, setNow] = useState(() => performance.now());
  const left = until - now;
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (left <= 0) {
      onDone();
    }
  }, [left, onDone]);
  if (left <= 0) {
    return null;
  }
  return (
    <div
      className={`panel ${styles.plate} ${styles.failed}`}
      role="status"
      data-testid="lockout-note"
    >
      <ResultMark success={false} />
      <span className={styles.plateText}>
        <span>{pl.station.failed}</span>
        <span className={styles.wait}>
          {pl.station.wait} {pl.station.seconds(secondsLeft(left))}
        </span>
      </span>
    </div>
  );
}
