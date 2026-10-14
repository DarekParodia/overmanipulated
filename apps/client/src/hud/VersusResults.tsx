// The versus parts of the results screen for players (S7-89): both newsrooms' points in one line
// in the ribbon („Kurier 240 : 195 Głos”, ours first, each with its badge), and the two team
// cards in the summary — badge, name, „Wy” / „Rywale”, a crown for the winner, then the points,
// the credibility and the folders closed with a verdict. No stars, progress or leaderboard.
import type { TeamScore } from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { TeamBadge, teamName } from '../ui/TeamBadge.tsx';
import { HudGlyph } from './HudGlyph.tsx';
import { formatScore } from './hud-model.ts';
import styles from './VersusResults.module.css';

export type VersusTeams = { own: TeamScore; rival: TeamScore };

/** „Kurier 240 : 195 Głos”: ours first; read out as one line. */
export function VersusScoreLine({ teams }: { teams: VersusTeams }) {
  const { own, rival } = teams;
  const label = pl.versus.scoreLine(
    teamName(own.team),
    own.score,
    teamName(rival.team),
    rival.score,
  );
  return (
    <p className={styles.scoreLine} role="img" aria-label={label} data-testid="versus-score-line">
      <TeamBadge team={own.team} size={28} />
      <span className={styles.lineName}>{teamName(own.team)}</span>
      <span className={styles.lineScore}>{formatScore(own.score)}</span>
      <span className={styles.lineColon}>:</span>
      <span className={styles.lineScore}>{formatScore(rival.score)}</span>
      <span className={styles.lineName}>{teamName(rival.team)}</span>
      <TeamBadge team={rival.team} size={28} />
    </p>
  );
}

function TeamCard({ team, own, winner }: { team: TeamScore; own: boolean; winner: boolean }) {
  return (
    <li
      className={`${styles.card} ${winner ? styles.winner : ''}`}
      data-testid={own ? 'versus-team-own' : 'versus-team-rival'}
      data-winner={winner || undefined}
    >
      <div className={styles.cardHead}>
        <TeamBadge team={team.team} size={30} />
        <span className={styles.cardName}>{teamName(team.team)}</span>
        <span className={`${styles.side} ${own ? styles.sideOwn : ''}`}>
          {own ? pl.versus.own : pl.versus.rival}
        </span>
        {winner && (
          <span className={styles.crown}>
            <Icon name="crown" size={24} label={pl.versus.winner} />
          </span>
        )}
      </div>
      <dl className={styles.figures}>
        <div className={styles.figure}>
          <dt>
            <HudGlyph name="star" size={22} fill="var(--yellow)" label={pl.results.score} />
          </dt>
          <dd>{formatScore(team.score)}</dd>
        </div>
        <div className={styles.figure}>
          <dt>
            <HudGlyph
              name="shield"
              size={22}
              fill={team.credibility > 0 ? 'var(--green)' : 'var(--red)'}
              label={pl.results.credibility}
            />
          </dt>
          <dd>{team.credibility}</dd>
        </div>
        <div className={styles.figure}>
          <dt>
            <Icon name="folder" size={22} label={pl.versus.resolved} />
          </dt>
          <dd>{team.resolved}</dd>
        </div>
      </dl>
    </li>
  );
}

/** The two team cards, ours first; `winnerTeam` null on a draw (no crown). */
export function TeamCards({
  teams,
  winnerTeam,
}: {
  teams: VersusTeams;
  winnerTeam: number | null;
}) {
  return (
    <ul className={styles.cards} aria-label={pl.versus.teamsLabel}>
      <TeamCard team={teams.own} own winner={winnerTeam === teams.own.team} />
      <TeamCard team={teams.rival} own={false} winner={winnerTeam === teams.rival.team} />
    </ul>
  );
}
