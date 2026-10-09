// Station overlay (S2-03): hosts the minigame for the station the local player operates, enforces
// the time limit and reports the outcome to the server exactly once. Also the two small plates
// shown around it: the hold-to-work ring while working, and the lockout plate after a failure.
import { getStory } from '@redakcja/content';
import { type Folder, MINIGAME_TIME_LIMIT_MS, ROLE_STATIONS, type Station } from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { KeyCap, ResultMark, STATION_ICON } from './kit.tsx';
import { minigameFor } from './minigames/index.ts';
import { OverlayFrame } from './OverlayFrame.tsx';
import { secondsLeft } from './overlay-logic.ts';
import styles from './StationOverlay.module.css';

/** How often the minigame clock re-renders. */
const CLOCK_INTERVAL_MS = 100;

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
  const skipsQueue =
    role !== undefined &&
    role !== null &&
    (ROLE_STATIONS[role] as readonly string[]).includes(station.kind);
  const story = folder ? getStory(folder.storyId) : undefined;
  const [startedAt] = useState(() => performance.now());
  const [now, setNow] = useState(startedAt);
  const settled = useRef(false);
  const elapsed = now - startedAt;
  const playable = story !== undefined;

  useInputCapture(true);
  useEffect(() => {
    emitCue('station.open');
  }, []);

  const finish = useCallback(
    (success: boolean) => {
      if (settled.current) {
        return;
      }
      settled.current = true;
      sendCommand({ kind: 'minigameResult', stationId: station.id, success });
      // Failure feedback comes with the server's minigameFailed event (net/game-events.ts).
      if (success) {
        emitCue('minigame.success');
      }
      onResult(success);
    },
    [station.id, onResult],
  );

  const close = useCallback(() => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    sendCommand({ kind: 'cancel' });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!playable) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playable]);

  useEffect(() => {
    if (playable && elapsed >= MINIGAME_TIME_LIMIT_MS) {
      finish(false);
    }
  }, [playable, elapsed, finish]);

  // The frame only takes `back`; everything else goes on to the minigame inside.
  useNavIntent((intent) => {
    if (intent !== 'back') {
      return false;
    }
    emitCue('ui.back');
    close();
    return true;
  });

  const Game = minigameFor(station.kind);
  const timeLeft = Math.max(0, MINIGAME_TIME_LIMIT_MS - elapsed);
  const timeUsed = Math.min(1, elapsed / MINIGAME_TIME_LIMIT_MS);

  return (
    <OverlayFrame
      title={pl.vocab.stations[station.kind]}
      icon={STATION_ICON[station.kind]}
      closeLabel={pl.station.leave}
      backKey={pl.station.backKey[device]}
      onClose={close}
      testId="station-overlay"
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
      {story ? (
        <Game
          seed={station.minigameSeed}
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
