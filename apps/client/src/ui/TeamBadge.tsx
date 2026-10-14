// A versus newsroom's badge (S7-89), in the PlayerMark style: Kurier is a navy masthead (a
// rounded square), Głos a white round seal with a navy outline, each with its initial. Shape and
// letter tell the teams apart without colour (and never look like the credibility shield); the
// fills come from the team tokens (`--team-N`, `--team-N-ink`).
import type { TeamIndex } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { teamColorVars } from './tokens.ts';

const SHAPE = {
  masthead: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z',
  seal: 'M12 2.4a9.6 9.6 0 1 0 0 19.2a9.6 9.6 0 1 0 0-19.2Z',
} as const;

/** Shape per team index. */
const TEAM_SHAPE = ['masthead', 'seal'] as const satisfies readonly (keyof typeof SHAPE)[];

/** The team's display name (`pl.vocab.teams`). */
export function teamName(team: TeamIndex): string {
  return pl.vocab.teams[team] ?? pl.vocab.teams[0];
}

export function TeamBadge({
  team,
  size = 24,
  label,
}: {
  team: TeamIndex;
  size?: number | string;
  /** Spoken name; omitted, the badge is decorative (the name is written next to it). */
  label?: string;
}) {
  const shape = TEAM_SHAPE[team] ?? 'masthead';
  const { fill, ink } = teamColorVars(team);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      data-team={team}
      data-shape={shape}
      style={{ flex: 'none', overflow: 'visible' }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        d={SHAPE[shape]}
        fill={fill}
        stroke="var(--outline)"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <text
        x="12"
        y="13"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={ink}
        style={{ font: '800 13px var(--font-display)' }}
      >
        {teamName(team).charAt(0)}
      </text>
    </svg>
  );
}
