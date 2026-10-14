// A newsroom's badge on the spectate screen (S7-90): Kurier is a navy shield with a white K, Głos
// a white round seal with a navy outline and a navy G. They differ in shape, letter and
// luminance and add no hue that could clash with the meaning colours or the player colours.
// S7-86 brings the shared `TeamBadge` for the lobby; this one moves there once it lands.
import type { TeamIndex } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import styles from './TeamSeal.module.css';

const SHIELD = 'M12 1.8 21 5v6.6c0 5-3.6 9-9 10.6-5.4-1.6-9-5.6-9-10.6V5Z';

export function TeamSeal({ team, size = 28 }: { team: TeamIndex; size?: number }) {
  const letter = (pl.vocab.teams[team] ?? '').charAt(0);
  const kurier = team === 0;
  return (
    <svg
      className={styles.seal}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      data-team={team}
    >
      {kurier ? (
        <path className={styles.shield} d={SHIELD} />
      ) : (
        <circle className={styles.ring} cx="12" cy="12" r="10" />
      )}
      <text
        className={kurier ? styles.inkLight : styles.inkDark}
        x="12"
        y="16.4"
        textAnchor="middle"
      >
        {letter}
      </text>
    </svg>
  );
}
