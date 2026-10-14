// Step-by-step reveal for the results screen (S3-08): stars pop in, then verdict marks slam onto
// the debrief cards, each step with a sound cue. Any tap or key finishes it at once; with
// reduced motion everything is shown from the start without the sequence.
import { useCallback, useEffect, useRef, useState } from 'react';
import { revealPlan } from './results-model.ts';

/**
 * When each step happens, in ms after mount: `stars` star steps, then `marks` mark steps (the
 * results reveal without its progress line and totals rows, see `revealPlan`).
 */
export function revealTimes(stars: number, marks: number): number[] {
  return revealPlan({ stars, rows: 0, marks, progress: false }).map((step) => step.atMs);
}

export type Reveal = {
  /** Steps shown so far. */
  revealed: number;
  done: boolean;
  /** True when the reveal was skipped (or never ran): show everything without animating. */
  instant: boolean;
  finish(): void;
};

export function useReveal(
  times: readonly number[],
  skipAll: boolean,
  onStep: (index: number) => void,
): Reveal {
  const [revealed, setRevealed] = useState(skipAll ? Number.POSITIVE_INFINITY : 0);
  const [instant, setInstant] = useState(skipAll);
  const startedAt = useRef(performance.now());
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const done = revealed >= times.length;
  const key = times.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for `times`
  useEffect(() => {
    if (instant) {
      return;
    }
    const elapsed = performance.now() - startedAt.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    times.forEach((at, index) => {
      if (index < revealedRef.current) {
        return;
      }
      timers.push(
        setTimeout(
          () => {
            setRevealed((n) => Math.max(n, index + 1));
            onStepRef.current(index);
          },
          Math.max(0, at - elapsed),
        ),
      );
    });
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [key, instant]);

  const finish = useCallback(() => {
    setInstant(true);
    setRevealed(Number.POSITIVE_INFINITY);
  }, []);

  return { revealed, done, instant, finish };
}
