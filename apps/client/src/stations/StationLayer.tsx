// Mount point for the 2D gameplay overlays drawn over the scene: the station minigame overlay
// with its work prompt and lockout note (S2-03), and the editorial desk sheet (S2-07). Which
// overlay is open follows the server: the station or desk the local player operates. A round is
// keyed by station, seed and the local player's start count (S7-41), so a minigame that reopens
// with the same seed (Druga szansa, the Kartoteka's kept card) opens the overlay again.
import { getStory } from '@redakcja/content';
import { type Difficulty, type Folder, failLockoutMs, type Verdict } from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { localAbility } from '../abilities/use-ability.ts';
import { installGameHook } from '../debug/game-hook.ts';
import { stationIsDown } from '../events/event-model.ts';
import { onGameEvent } from '../net/game-events.ts';
import {
  selectFolderOn,
  selectOperatedDesk,
  selectOperatedStation,
  useGame,
} from '../net/game-store.ts';
import { runtime, sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { DeskOverlay, type VerdictResultEvent } from './DeskOverlay.tsx';
import { LockoutNote, StationOverlay, WorkPrompt } from './StationOverlay.tsx';
import {
  countStart,
  failureReopens,
  type LocalStarts,
  lockoutUntil as lockoutEnd,
  NO_STARTS,
  shownRound,
} from './station-round.ts';

/**
 * How long the verdict outcome stays on the desk sheet unless dismissed: longer after a
 * mistake, so there is time to read the right verdict and the deciding station (S7-04).
 */
const VERDICT_RESULT_SHOW_MS = { good: 4000, bad: 6500 } as const;
/** A sent verdict with no answer by then can be sent again. */
const VERDICT_PENDING_TIMEOUT_MS = 4000;

export function StationLayer() {
  const playerId = useApp((s) => s.playerId);
  useEffect(() => installGameHook(), []);
  return (
    <>
      <StationHost playerId={playerId} />
      <DeskHost playerId={playerId} />
    </>
  );
}

function StationHost({ playerId }: { playerId: string | null }) {
  const station = useGame((s) => selectOperatedStation(s, playerId));
  const folder = useGame((s) => (station ? selectFolderOn(s, station.id) : undefined));
  // The round the player already finished or left, hidden until the server moves on.
  const [settledRound, setSettledRound] = useState<string | null>(null);
  // The local player's minigame starts so far (the round nonce) and the latest one.
  const [starts, setStarts] = useState<LocalStarts>(NO_STARTS);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  // The station the lockout plate is about (for its Druga szansa line).
  const [lockedStation, setLockedStation] = useState<string | null>(null);
  const difficulty = useApp((s) => s.difficulty);
  // A local failure shows an estimate until the server's `minigameFailed` replaces it with the
  // real length: the room's difficulty lockout (`failLockoutMs`, S7-24), then the last non-zero
  // lockout the server announced on that difficulty.
  const announced = useRef<{ difficulty: Difficulty; ms: number } | null>(null);
  const estimateLockoutMs = useCallback(
    () =>
      announced.current?.difficulty === difficulty
        ? announced.current.ms
        : failLockoutMs(difficulty),
    [difficulty],
  );
  // A station that is down (outage event) opens no minigame and shows no work prompt; the
  // server also kicks the worker out, this covers the snapshot or two before that.
  const down = stationIsDown(station);
  const round = shownRound(station, starts, settledRound, down);

  const startLockout = useCallback((ms: number, stationId: string | null) => {
    setLockoutUntil((until) => Math.max(until, performance.now() + ms));
    setLockedStation(stationId);
  }, []);

  useEffect(
    () =>
      onGameEvent((event) => {
        if (event.kind === 'minigameStarted' && event.playerId === playerId) {
          setStarts((current) => countStart(current, event.stationId, event.seed));
        } else if (event.kind === 'minigameFailed' && event.playerId === playerId) {
          // A lockout-free failure (0, Druga szansa) hides the note but is no estimate for the
          // next one.
          if (event.lockoutMs > 0) {
            announced.current = { difficulty: useApp.getState().difficulty, ms: event.lockoutMs };
          }
          setLockoutUntil(lockoutEnd(event.lockoutMs, performance.now()));
          setLockedStation(event.stationId);
        }
      }),
    [playerId],
  );

  const phase = station?.phase;
  const serverLockoutMs = station?.lockoutMs ?? 0;
  // Only on entering lockout; the countdown itself then runs locally.
  // biome-ignore lint/correctness/useExhaustiveDependencies: serverLockoutMs is read on entry only
  useEffect(() => {
    if (phase === 'lockout') {
      startLockout(serverLockoutMs, station?.id ?? null);
    }
  }, [phase, startLockout]);

  // The server has moved on once the station leaves the minigame (or the player leaves it). A
  // Kartoteka retry reopens the same card, i.e. the same round id (S7-13), so the settled round
  // is forgotten here and not only when the player stops operating: after a cancel, work held
  // on may take the station again before any snapshot shows it free. A round that never leaves
  // the minigame (armed Druga szansa) gets a new key from the start count instead. The latest
  // start's seed is dropped here too, so a start the client missed (a reconnect) never holds a
  // later round back.
  const inMinigame = phase === 'minigame';
  useEffect(() => {
    if (!inMinigame) {
      setSettledRound(null);
      setStarts((current) => (current.last ? { ...current, last: null } : current));
    }
  }, [inMinigame]);

  const stationId = station?.id ?? null;
  const onResult = useCallback(
    (success: boolean) => {
      setSettledRound(round);
      // An armed Druga szansa reopens the minigame instead: no estimate, no plate flash.
      if (!success && !failureReopens(localAbility(runtime, playerId))) {
        startLockout(estimateLockoutMs(), stationId);
      }
    },
    [round, startLockout, estimateLockoutMs, playerId, stationId],
  );
  const onClose = useCallback(() => setSettledRound(round), [round]);

  return (
    <>
      {station && round !== null && (
        <StationOverlay
          key={round}
          station={station}
          folder={folder}
          onResult={onResult}
          onClose={onClose}
        />
      )}
      {station?.phase === 'working' && !down && <WorkPrompt station={station} />}
      {lockoutUntil > 0 && (
        <LockoutNote
          key={lockoutUntil}
          until={lockoutUntil}
          stationId={lockedStation}
          onDone={() => setLockoutUntil(0)}
        />
      )}
    </>
  );
}

type ShownResult = { event: VerdictResultEvent; folder: Folder };

function DeskHost({ playerId }: { playerId: string | null }) {
  const desk = useGame((s) => selectOperatedDesk(s, playerId));
  const folder = useGame((s) => (desk ? selectFolderOn(s, desk.id) : undefined));
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<ShownResult | null>(null);
  const lastFolder = useRef<Folder | undefined>(undefined);
  const session = desk && folder ? `${desk.id}:${folder.id}` : null;

  useEffect(() => {
    if (folder) {
      lastFolder.current = folder;
    }
  }, [folder]);

  useEffect(
    () =>
      onGameEvent((event) => {
        if (event.kind !== 'verdictResult' || event.playerId !== playerId) {
          return;
        }
        const known = lastFolder.current;
        const shown: Folder =
          known?.id === event.folderId
            ? known
            : {
                id: event.folderId,
                spawnKey: event.spawnKey,
                storyId: event.storyId,
                location: { kind: 'fixture', fixtureId: 'desk' },
                stamps: [...event.justifyingStampIds],
                spawnedAtMs: 0,
                deadlineMs: 0,
                warned: false,
              };
        setPending(null);
        setResult({ event, folder: shown });
      }),
    [playerId],
  );

  useEffect(() => {
    if (!result) {
      return;
    }
    const showMs = VERDICT_RESULT_SHOW_MS[result.event.outcome === 'correct' ? 'good' : 'bad'];
    const timer = setTimeout(() => setResult(null), showMs);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    if (pending === null) {
      return;
    }
    const timer = setTimeout(() => setPending(null), VERDICT_PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const atDesk = desk !== undefined;
  useEffect(() => {
    if (!atDesk) {
      setDismissed(null);
    }
  }, [atDesk]);

  const onVerdict = (verdict: Verdict, justifyingStampIds: string[]) => {
    if (!folder || pending !== null) {
      return;
    }
    setPending(folder.id);
    sendCommand({ kind: 'verdict', folderId: folder.id, verdict, justifyingStampIds });
  };
  const onClose = () => {
    setDismissed(session);
    sendCommand({ kind: 'cancel' });
  };
  const onDismissResult = () => setResult(null);

  if (result) {
    return (
      <DeskOverlay
        key={`result:${result.event.folderId}`}
        folder={result.folder}
        story={getStory(result.event.storyId)}
        pending={false}
        result={result.event}
        onVerdict={onVerdict}
        onClose={onDismissResult}
        onDismissResult={onDismissResult}
      />
    );
  }
  if (!folder || session === null || session === dismissed) {
    return null;
  }
  return (
    <DeskOverlay
      key={session}
      folder={folder}
      story={getStory(folder.storyId)}
      pending={pending === folder.id}
      result={null}
      onVerdict={onVerdict}
      onClose={onClose}
      onDismissResult={onDismissResult}
    />
  );
}
