// Station overlay (S2-03): hosts the minigame for the station the local player operates, enforces
// the time limit and reports the outcome to the server exactly once. Also the two small plates
// shown around it: the hold-to-work prompt while working, and the lockout note after a failure.
import { getStory } from '@redakcja/content';
import { type Folder, MINIGAME_TIME_LIMIT_MS, type Station } from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { minigameFor } from './minigames/index.ts';
import { OverlayFrame } from './OverlayFrame.tsx';
import { formatCountdown, secondsLeft } from './overlay-logic.ts';
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
      emitCue(success ? 'minigame.success' : 'minigame.fail');
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
  const urgent = timeLeft <= MINIGAME_TIME_LIMIT_MS * 0.25;

  return (
    <OverlayFrame
      kicker={pl.vocab.stations[station.kind]}
      formNo={pl.station.formNo(stationNumber(station.id))}
      closeLabel={pl.station.leave}
      closeHint={pl.station.leaveHint[device]}
      onClose={close}
      testId="station-overlay"
      aside={
        playable && (
          <span
            className={`${styles.clock} ${urgent ? styles.urgent : ''}`}
            data-testid="station-clock"
          >
            <span className="label">{pl.station.timeLeft}</span>
            <span className={styles.clockValue}>{formatCountdown(timeLeft)}</span>
            <span className={styles.fuse} aria-hidden="true">
              <span style={{ transform: `scaleX(${1 - timeUsed})` }} />
            </span>
          </span>
        )
      }
    >
      {story ? (
        <>
          <p className={styles.folderLine}>
            <span className="label">{pl.station.folder}</span> {typeset(story.headline)}
          </p>
          <Game
            seed={station.minigameSeed}
            story={story}
            stamp={story.stamps.find((s) => s.station === station.kind)}
            device={device}
            timeUsed={timeUsed}
            onDone={finish}
          />
        </>
      ) : (
        <p className="typed">{folder ? pl.station.unknownStory : pl.station.noFolder}</p>
      )}
    </OverlayFrame>
  );
}

/** "imageSearch-0" → 1: the number typed on the station's form. */
function stationNumber(id: string): number {
  const n = Number.parseInt(id.slice(id.lastIndexOf('-') + 1), 10);
  return Number.isFinite(n) ? n + 1 : 1;
}

/** Compact plate while the player holds the work button: which key, and how far along. */
export function WorkPrompt({ station }: { station: Station }) {
  const device = useApp((s) => s.inputDevice);
  const progress =
    station.durationMs > 0 ? Math.min(1, station.progressMs / station.durationMs) : 0;
  return (
    <div className={styles.plate} role="status" data-testid="work-prompt">
      <span className="label">{pl.vocab.stations[station.kind]}</span>
      <span className={styles.plateText}>
        {pl.station.working} · {pl.station.holdWork[device]}
      </span>
      <span
        className={styles.progress}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <span style={{ transform: `scaleX(${progress})` }} />
      </span>
    </div>
  );
}

/** "Failed, wait" note after a lost minigame; disappears when the lockout runs out. */
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
    <div className={`${styles.plate} ${styles.failed}`} role="status" data-testid="lockout-note">
      <span className={styles.plateText}>{pl.station.failed}</span>
      <span className={styles.wait}>{pl.station.wait(secondsLeft(left))}</span>
    </div>
  );
}
