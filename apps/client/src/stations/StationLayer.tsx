// Mount point for the 2D gameplay overlays drawn over the scene: the station minigame overlay
// with its work prompt and lockout note (S2-03), and the editorial desk sheet (S2-07). Which
// overlay is open follows the server: the station or desk the local player operates.
import { getStory } from '@redakcja/content';
import { type Folder, MINIGAME_FAIL_LOCKOUT_MS, type Verdict } from '@redakcja/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { installGameHook } from '../debug/game-hook.ts';
import { onGameEvent } from '../net/game-events.ts';
import {
  selectFolderOn,
  selectOperatedDesk,
  selectOperatedStation,
  useGame,
} from '../net/game-store.ts';
import { sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { DeskOverlay, type VerdictResultEvent } from './DeskOverlay.tsx';
import { LockoutNote, StationOverlay, WorkPrompt } from './StationOverlay.tsx';

/** How long the verdict outcome stays on the desk sheet unless dismissed. */
const VERDICT_RESULT_SHOW_MS = 4000;
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
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const round = station ? `${station.id}:${station.minigameSeed}` : null;

  const startLockout = useCallback((ms: number) => {
    setLockoutUntil((until) => Math.max(until, performance.now() + ms));
  }, []);

  useEffect(
    () =>
      onGameEvent((event) => {
        if (event.kind === 'minigameFailed' && event.playerId === playerId) {
          startLockout(MINIGAME_FAIL_LOCKOUT_MS);
        }
      }),
    [playerId, startLockout],
  );

  const phase = station?.phase;
  const serverLockoutMs = station?.lockoutMs ?? 0;
  // Only on entering lockout; the countdown itself then runs locally.
  // biome-ignore lint/correctness/useExhaustiveDependencies: serverLockoutMs is read on entry only
  useEffect(() => {
    if (phase === 'lockout') {
      startLockout(serverLockoutMs);
    }
  }, [phase, startLockout]);

  const operating = station !== undefined;
  useEffect(() => {
    if (!operating) {
      setSettledRound(null);
    }
  }, [operating]);

  const onResult = useCallback(
    (success: boolean) => {
      setSettledRound(round);
      if (!success) {
        startLockout(MINIGAME_FAIL_LOCKOUT_MS);
      }
    },
    [round, startLockout],
  );
  const onClose = useCallback(() => setSettledRound(round), [round]);

  return (
    <>
      {station?.phase === 'minigame' && round !== settledRound && (
        <StationOverlay
          key={round}
          station={station}
          folder={folder}
          onResult={onResult}
          onClose={onClose}
        />
      )}
      {station?.phase === 'working' && <WorkPrompt station={station} />}
      {lockoutUntil > 0 && (
        <LockoutNote key={lockoutUntil} until={lockoutUntil} onDone={() => setLockoutUntil(0)} />
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
                storyId: event.storyId,
                location: { kind: 'fixture', fixtureId: 'desk' },
                stamps: [event.justifyingStampId],
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
    const timer = setTimeout(() => setResult(null), VERDICT_RESULT_SHOW_MS);
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

  const onVerdict = (verdict: Verdict, justifyingStampId: string) => {
    if (!folder || pending !== null) {
      return;
    }
    setPending(folder.id);
    sendCommand({ kind: 'verdict', folderId: folder.id, verdict, justifyingStampId });
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
