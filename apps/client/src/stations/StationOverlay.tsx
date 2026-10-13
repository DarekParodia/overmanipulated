// Station overlay (S2-03): hosts the minigame for the station the local player operates, enforces
// the time limit and reports the outcome to the server exactly once. Also the two small plates
// shown around it: the hold-to-work ring while working, and the lockout plate after a failure.
// A station that keeps its card (the Kartoteka, MINIGAME_STABLE_SEED_STATIONS) starts a round
// that follows a cancel with the clock that was left (S7-14, retry-memory.ts). The room's
// difficulty sets the time limit and whether a failure shows the answer (S7-24, rules.ts).
// Role abilities (S7-41): R / RB arrive here as the nav intent `ability` while the overlay owns
// the input. In a minigame the player's Ekspertyza covers, the header offers it (a button with
// the key cap; icon only on phones, where it is the only way to use it mid-minigame): the round
// is settled, the press is sent and the button waits for the server to stamp and free the
// station. Any other press goes the same way as one in the world (`runtime.pressAbility`).
import { getStory } from '@redakcja/content';
import {
  type Folder,
  MINIGAME_STABLE_SEED_STATIONS,
  ROLE_PERKS,
  type Station,
} from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ABILITY_ICON } from '../abilities/ability-icons.ts';
import { localAbility, useLocalAbility } from '../abilities/use-ability.ts';
import { emitCue } from '../fx/feedback.ts';
import { useEffectiveHints } from '../guidance/store.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { runtime, sendCommand } from '../net/session.ts';
import { abilityKeyCap } from '../screens/settings-model.ts';
import { type InputDevice, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { ProgressRing } from '../ui/ProgressRing.tsx';
import { KeyCap, ResultMark, STATION_ICON } from './kit.tsx';
import { minigameFor } from './minigames/index.ts';
import {
  recallCard,
  remainingAfter,
  roundClockMs,
  useRetryMemory,
} from './minigames/retry-memory.ts';
import { roundRules } from './minigames/rules.ts';
import { OverlayFrame } from './OverlayFrame.tsx';
import { secondsLeft } from './overlay-logic.ts';
import styles from './StationOverlay.module.css';
import { expertiseOffered, secondChanceOffered } from './station-round.ts';

/** How often the minigame clock re-renders. */
const CLOCK_INTERVAL_MS = 100;
/**
 * A sent Ekspertyza with no stamp by then gives the round back to the player (the server found
 * nothing to do, e.g. a teammate's stamp landed first), so the overlay never hangs.
 */
const EXPERTISE_PENDING_TIMEOUT_MS = 4000;
/** How often the lockout plate re-renders its countdown. */
const LOCKOUT_TICK_MS = 250;

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
  const [{ clockMs, resumeMs }] = useState(() => {
    const entry = keepsCard ? recallCard(seed) : undefined;
    const clock = roundClockMs(entry, limitMs);
    const resumed = entry !== undefined && entry.remainingMs !== null;
    return { clockMs: clock, resumeMs: resumed ? clock : undefined };
  });
  const [startedAt] = useState(() => performance.now());
  const [now, setNow] = useState(startedAt);
  const settled = useRef(false);
  const playerId = useApp((s) => s.playerId);
  const local = useLocalAbility(runtime);
  const [expertiseSent, setExpertiseSent] = useState(false);
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

  const close = useCallback(() => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    if (keepsCard && playable) {
      // Putting the card down keeps the clock where it was: no fresh time for a peek.
      const left = remainingAfter(clockMs, performance.now() - startedAt);
      useRetryMemory.getState().rememberCancel(seed, left);
    }
    sendCommand({ kind: 'cancel' });
    onClose();
  }, [keepsCard, playable, clockMs, startedAt, seed, onClose]);

  /** Ekspertyza mid-minigame: the round ends here, the server stamps and frees the station. */
  const sendExpertise = useCallback(() => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    emitCue('ui.click');
    setExpertiseSent(true);
    sendCommand({ kind: 'useAbility' });
  }, []);

  useEffect(() => {
    if (!expertiseSent) {
      return;
    }
    const timer = setTimeout(() => {
      settled.current = false;
      setExpertiseSent(false);
    }, EXPERTISE_PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [expertiseSent]);

  useEffect(() => {
    if (!playable) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playable]);

  useEffect(() => {
    if (playable && elapsed >= clockMs) {
      finish(false);
    }
  }, [playable, elapsed, clockMs, finish]);

  // The frame takes `back` and `ability`; everything else goes on to the minigame inside, except
  // while a sent Ekspertyza waits for its stamp.
  useNavIntent((intent) => {
    if (expertiseSent) {
      return true;
    }
    if (intent === 'ability') {
      if (expertiseOffered(localAbility(runtime, playerId), station.id)) {
        sendExpertise();
      } else {
        runtime.pressAbility();
      }
      return true;
    }
    if (intent !== 'back') {
      return false;
    }
    emitCue('ui.back');
    close();
    return true;
  });

  const Game = minigameFor(station.kind);
  const timeLeft = remainingAfter(clockMs, elapsed);
  // Shares of the full limit, so a resumed round shows the clock as it was left.
  const timeUsed = Math.min(1, 1 - timeLeft / limitMs);

  return (
    <OverlayFrame
      title={pl.vocab.stations[station.kind]}
      icon={STATION_ICON[station.kind]}
      closeLabel={pl.station.leave}
      backKey={pl.station.backKey[device]}
      onClose={close}
      testId="station-overlay"
      headerAction={
        expertiseSent || expertiseOffered(local, station.id) ? (
          <ExpertiseButton device={device} sending={expertiseSent} onPress={sendExpertise} />
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
      {story ? (
        <div className={expertiseSent ? styles.sending : undefined} aria-busy={expertiseSent}>
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
        </div>
      ) : (
        <p className={styles.empty}>{folder ? pl.station.unknownStory : pl.station.noFolder}</p>
      )}
    </OverlayFrame>
  );
}

/**
 * The header's Ekspertyza button: the ability icon, the name and the key cap (R / RB); only the
 * icon on phones. While the press is on its way it reads „Ekspertyza…” and takes no more taps.
 */
function ExpertiseButton({
  device,
  sending,
  onPress,
}: {
  device: InputDevice;
  sending: boolean;
  onPress(): void;
}) {
  // The short name, as on the HUD chip, leaves the header's time bar room; the full name is the
  // accessible one.
  const label = sending ? pl.station.expertiseSending : pl.vocab.abilities.expertise;
  const shown = sending ? pl.station.expertiseSending : pl.touch.ability.expertise;
  return (
    <button
      type="button"
      className={styles.expertise}
      aria-label={label}
      title={label}
      disabled={sending}
      data-testid="station-expertise"
      data-sending={sending || undefined}
      onClick={onPress}
    >
      <Icon name={ABILITY_ICON.expertise} size={26} />
      <span className={styles.expertiseText} aria-hidden="true">
        {shown}
      </span>
      {device !== 'touch' && !sending && (
        <span className={styles.expertiseKey} aria-hidden="true">
          <KeyCap>{abilityKeyCap(device)}</KeyCap>
        </span>
      )}
    </button>
  );
}

/** While the player holds the work button: a big progress ring and "Hold [key]". */
export function WorkPrompt({ station }: { station: Station }) {
  const device = useApp((s) => s.inputDevice);
  const progress =
    station.durationMs > 0 ? Math.min(1, station.progressMs / station.durationMs) : 0;
  return (
    <div className={`panel ${styles.plate}`} role="status" data-testid="work-prompt">
      <ProgressRing
        progress={progress}
        tone="work"
        className={styles.ring}
        label={pl.vocab.stations[station.kind]}
      >
        <Icon name={STATION_ICON[station.kind]} size={26} />
      </ProgressRing>
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

/**
 * "Missed, wait" plate after a lost minigame; disappears when the lockout runs out. When the
 * local Druga szansa would reopen the locked station now, a hint line names the press (the key
 * cap, or the ability icon pointing at the touch button); hidden with the effective hints off.
 */
export function LockoutNote({
  until,
  stationId,
  onDone,
}: {
  until: number;
  /** The locked station, from the server's `minigameFailed`; null when unknown. */
  stationId: string | null;
  onDone(): void;
}) {
  const device = useApp((s) => s.inputDevice);
  const local = useLocalAbility(runtime);
  const hintsOn = useEffectiveHints();
  const [now, setNow] = useState(() => performance.now());
  const left = until - now;
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), LOCKOUT_TICK_MS);
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
  const offered = secondChanceOffered(local, stationId, hintsOn);
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
        {offered && (
          <span className={styles.second} data-testid="lockout-second-chance">
            {device === 'touch' ? (
              <Icon name={ABILITY_ICON.secondChance} size={20} />
            ) : (
              <KeyCap>{abilityKeyCap(device)}</KeyCap>
            )}
            {pl.vocab.abilities.secondChance}
          </span>
        )}
      </span>
    </div>
  );
}
