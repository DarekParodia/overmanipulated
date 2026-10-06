// A number that rolls towards its target like a mechanical counter (score roll-up). With
// reduced motion it jumps straight to the target.
import { useEffect, useRef, useState } from 'react';
import { easeOutCubic } from '../fx/animation/easing.ts';
import { useSettings } from '../store/settings.ts';

const ROLL_MS = 450;

export function useRolledNumber(target: number): number {
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (reducedMotion || shownRef.current === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const from = shownRef.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ROLL_MS);
      const value = Math.round(from + (target - from) * easeOutCubic(t));
      shownRef.current = value;
      setShown(value);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);

  return shown;
}
