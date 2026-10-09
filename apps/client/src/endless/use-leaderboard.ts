// Fetches one leaderboard list (S4-11) with loading / ready / error states. When the caller
// expects its own just-finished run in the list and it is not there yet (the server may still be
// saving it), the list is fetched once more shortly after.
import type { LeaderboardEntry } from '@redakcja/shared';
import { LEADERBOARD_DEFAULT_LIMIT } from '@redakcja/shared';
import { useCallback, useEffect, useState } from 'react';
import { fetchLeaderboard } from '../net/api.ts';
import type { EndlessRun } from '../store/progress.ts';
import { findOwnRun } from './endless-model.ts';

export type LeaderboardScope = 'room' | 'global';

export type LeaderboardState =
  | { status: 'loading'; entries: readonly LeaderboardEntry[] }
  | { status: 'ready'; entries: readonly LeaderboardEntry[] }
  | { status: 'error'; entries: readonly LeaderboardEntry[] };

const NO_ENTRIES: readonly LeaderboardEntry[] = [];
const RECHECK_MS = 1500;
const MAX_RECHECKS = 2;

export function useLeaderboard(
  scope: LeaderboardScope,
  roomCode: string | null,
  expected?: (EndlessRun & { roomCode: string }) | null,
): LeaderboardState & { retry(): void } {
  const [state, setState] = useState<LeaderboardState>({ status: 'loading', entries: NO_ENTRIES });
  const [attempt, setAttempt] = useState(0);
  const [rechecks, setRechecks] = useState(0);
  const score = expected?.score;
  const survivedS = expected?.survivedS;
  const expectedRoom = expected?.roomCode;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the fetch on retry.
  useEffect(() => {
    if (scope === 'room' && !roomCode) {
      setState({ status: 'ready', entries: NO_ENTRIES });
      return;
    }
    const abort = new AbortController();
    let recheck: ReturnType<typeof setTimeout> | undefined;
    setState((previous) =>
      previous.status === 'ready' ? previous : { status: 'loading', entries: NO_ENTRIES },
    );
    fetchLeaderboard(scope, roomCode, LEADERBOARD_DEFAULT_LIMIT, abort.signal)
      .then((response) => {
        setState({ status: 'ready', entries: response.entries });
        const missing =
          score !== undefined &&
          survivedS !== undefined &&
          expectedRoom !== undefined &&
          findOwnRun(response.entries, { score, survivedS, roomCode: expectedRoom }) < 0;
        if (missing && rechecks < MAX_RECHECKS) {
          recheck = setTimeout(() => setRechecks((n) => n + 1), RECHECK_MS);
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setState({ status: 'error', entries: NO_ENTRIES });
        }
      });
    return () => {
      abort.abort();
      if (recheck) {
        clearTimeout(recheck);
      }
    };
  }, [scope, roomCode, attempt, rechecks, score, survivedS, expectedRoom]);

  const retry = useCallback(() => {
    setRechecks(0);
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
