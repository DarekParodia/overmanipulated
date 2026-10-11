// Holds the game screen back until the assets it needs have arrived (fonts and the lazy game
// chunk always; sound files only for a short grace period, so a slow audio server never blocks play).
import { lazy, Suspense, useEffect, useState } from 'react';
import { Loading } from '../screens/Loading.tsx';
import { loadGameScreen } from './game-chunk.ts';
import { startPreload } from './preload.ts';
import { allDone, blockingDone, useLoading } from './progress.ts';

/** How long non-blocking assets (sound) may delay the start of a match. */
export const SOUND_GRACE_MS = 4000;
/** After this long the game starts whatever is still missing. */
export const GIVE_UP_MS = 20_000;

const GameScreen = lazy(() => loadGameScreen().then((module) => ({ default: module.GameScreen })));

export function GameGate() {
  const tasks = useLoading((s) => s.tasks);
  const [graceOver, setGraceOver] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    startPreload();
    const grace = setTimeout(() => setGraceOver(true), SOUND_GRACE_MS);
    const giveUp = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => {
      clearTimeout(grace);
      clearTimeout(giveUp);
    };
  }, []);

  const ready = gaveUp || (blockingDone(tasks) && (graceOver || allDone(tasks)));
  return ready ? (
    <Suspense fallback={<Loading />}>
      <GameScreen />
    </Suspense>
  ) : (
    <Loading />
  );
}
