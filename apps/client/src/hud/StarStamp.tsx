// One rating star on the level-end front page, drawn as a round rubber stamp with a star cut
// into it. Earned stars are slammed in red ink one after another; missing ones are a faint
// pencil outline (the label says how many were earned, so colour never carries it alone).
import { createRng } from '@redakcja/shared';
import { useId, useMemo } from 'react';
import styles from './ResultsPlate.module.css';

const STAR =
  'M50 17.5 L58.6 38.3 L81.2 39.6 L63.7 54 L69.4 76.1 L50.3 63.8 L30.9 76.3 L36.6 54.1 L18.9 39.8 L41.4 38.2 Z';

export function StarStamp({
  earned,
  seed,
  delayMs,
}: {
  earned: boolean;
  seed: number;
  delayMs: number;
}) {
  const maskId = useId();
  const { rotation, frequency } = useMemo(() => {
    const rng = createRng(seed);
    return { rotation: (rng.next() - 0.5) * 10, frequency: 0.7 + rng.next() * 0.4 };
  }, [seed]);

  return (
    <svg
      viewBox="0 0 100 100"
      className={`${styles.star} ${earned ? styles.starEarned : styles.starMissing}`}
      style={{
        ['--stamp-rotation' as string]: `${rotation}deg`,
        animationDelay: `${delayMs}ms`,
      }}
      aria-hidden
    >
      <defs>
        <filter id={`${maskId}-noise`} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={frequency}
            numOctaves={2}
            seed={seed % 1000}
          />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 2.4" />
        </filter>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <rect width="100%" height="100%" filter={`url(#${maskId}-noise)`} fill="black" />
        </mask>
      </defs>
      <g mask={earned ? `url(#${maskId})` : undefined} stroke="currentColor" fill="none">
        <circle cx="50" cy="50" r="45" strokeWidth={earned ? 5 : 1.5} />
        <circle cx="50" cy="50" r="37" strokeWidth="1.5" />
        <path
          d={STAR}
          fill={earned ? 'currentColor' : 'none'}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeDasharray={earned ? undefined : '4 3'}
        />
      </g>
    </svg>
  );
}
