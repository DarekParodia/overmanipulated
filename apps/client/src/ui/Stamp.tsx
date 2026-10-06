// Rubber stamp — the signature element (agents/design-rules.md §6). Drawn as SVG with an ink
// texture mask and a seeded rotation, so each stamp looks pressed by hand but never jitters.
import { createRng } from '@redakcja/shared';
import { useId, useMemo } from 'react';
import styles from './Stamp.module.css';

export type StampShape = 'rect' | 'circle' | 'double';
export type StampTone = 'red' | 'blue' | 'ochre' | 'ink';

export type StampProps = {
  text: string;
  /** Second, smaller line (e.g. a date or station name). */
  subtext?: string;
  shape?: StampShape;
  tone?: StampTone;
  /** Seed for rotation and ink irregularity; use a stable id (folder id, stamp id). */
  seed: number;
  /** Plays the slam animation on mount. */
  slam?: boolean;
  size?: number;
};

export function Stamp({
  text,
  subtext,
  shape = 'rect',
  tone = 'red',
  seed,
  slam = false,
  size = 180,
}: StampProps) {
  const maskId = useId();
  const { rotation, baseFrequency, inkCut } = useMemo(() => {
    const rng = createRng(seed);
    return {
      rotation: (rng.next() - 0.5) * 6,
      baseFrequency: 0.6 + rng.next() * 0.5,
      inkCut: 0.32 + rng.next() * 0.12,
    };
  }, [seed]);

  const width = shape === 'circle' ? 120 : 220;
  const height = shape === 'circle' ? 120 : 90;
  const label = subtext ? `${text}, ${subtext}` : text;

  return (
    <svg
      className={`${styles.stamp} ${styles[tone]} ${slam ? styles.slam : ''}`}
      style={{ ['--stamp-rotation' as string]: `${rotation}deg` }}
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      role="img"
      aria-label={label}
    >
      <defs>
        <filter id={`${maskId}-noise`} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={baseFrequency}
            numOctaves={2}
            seed={seed % 1000}
          />
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 ${3.1 - inkCut * 2}`}
          />
        </filter>
        <mask id={maskId}>
          <rect width="100%" height="100%" fill="white" />
          <rect
            width="100%"
            height="100%"
            filter={`url(#${maskId}-noise)`}
            fill="black"
            opacity="0.85"
          />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`} fill="none" stroke="currentColor">
        {shape === 'circle' ? (
          <>
            <circle cx="60" cy="60" r="55" strokeWidth="5" />
            <circle cx="60" cy="60" r="46" strokeWidth="1.6" />
          </>
        ) : (
          <>
            <rect x="4" y="4" width={width - 8} height={height - 8} strokeWidth="5" />
            {shape === 'double' && (
              <rect x="12" y="12" width={width - 24} height={height - 24} strokeWidth="1.6" />
            )}
          </>
        )}
        <text
          x="50%"
          y={subtext ? '47%' : '55%'}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="currentColor"
          stroke="none"
          className={shape === 'circle' ? styles.circleText : styles.text}
          textLength={shape === 'circle' ? 72 : width - 44}
          lengthAdjust="spacingAndGlyphs"
        >
          {text.toUpperCase()}
        </text>
        {subtext && (
          <text
            x="50%"
            y={shape === 'circle' ? '72%' : '76%'}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
            stroke="none"
            className={styles.subtext}
          >
            {subtext}
          </text>
        )}
      </g>
    </svg>
  );
}
