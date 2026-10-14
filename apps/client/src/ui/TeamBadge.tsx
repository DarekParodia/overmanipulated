// Versus newsroom mark (S7-86), in the PlayerMark style: Kurier is a navy shield with a white
// „K”, Głos a white round seal with a navy „G”. Shape and letter tell the two apart, so colour is
// never the only signal (the fills are the `--team-N` tokens, design-rules §3).
import type { TeamIndex } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { teamColorVars } from './tokens.ts';

/** The newsroom's name: Kurier (0) or Głos (1). */
export function teamName(team: TeamIndex): string {
  return pl.vocab.teams[team === 1 ? 1 : 0];
}

/** Kurier: a shield, flat top and pointed bottom; the letter sits in its wide upper part. */
const SHIELD = {
  d: 'M3 3.5h18v7.5c0 5.2-3.8 8.6-9 10.5c-5.2-1.9-9-5.3-9-10.5Z',
  letterY: 12.4,
};
/** Głos: a scalloped round seal, like a rubber stamp. */
const SEAL = {
  d: 'M12 2l2.4 1.9 3-.4 1.2 2.8 2.8 1.2-.4 3L22 12l-1.9 2.4.4 3-2.8 1.2-1.2 2.8-3-.4L12 22l-2.4-1.9-3 .4-1.2-2.8-2.8-1.2.4-3L2 12l1.9-2.4-.4-3 2.8-1.2 1.2-2.8 3 .4Z',
  letterY: 13.2,
};

export function TeamBadge({
  team,
  size = 28,
  label,
}: {
  team: TeamIndex;
  size?: number;
  /** Accessible name; omit when the newsroom's name is written next to the badge. */
  label?: string;
}) {
  const { fill, ink } = teamColorVars(team);
  const shape = team === 1 ? SEAL : SHIELD;
  const name = teamName(team);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-team={team}
      style={{ flex: 'none' }}
    >
      <path
        d={shape.d}
        fill={fill}
        stroke="var(--outline)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <text
        x={12}
        y={shape.letterY}
        fill={ink}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-display)"
        fontWeight={800}
        fontSize={11}
      >
        {name.charAt(0)}
      </text>
    </svg>
  );
}
