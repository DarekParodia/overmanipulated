// The two newsrooms of Na punkty (S7-86): a column each with its TeamBadge, name and „n z 4”,
// the players as compact cards and, while a seat is free, a dashed seat. A player of the other
// newsroom finds „Przejdź tutaj” in that seat (a white button: the footer keeps the only yellow
// action). A note says when the newsrooms are uneven; it never blocks the start.
import { type LobbyPlayer, MAX_TEAM_PLAYERS, type TeamIndex } from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import { TeamBadge, teamName } from '../../ui/TeamBadge.tsx';
import { canJoinTeam, teamPlayers, unevenTeams } from './lobby-model.ts';
import { PlayerCard } from './PlayerCard.tsx';
import styles from './TeamColumns.module.css';

const TEAMS: readonly TeamIndex[] = [0, 1];

export type TeamColumnsProps = {
  players: readonly LobbyPlayer[];
  hostId: string;
  selfId: string | null;
  disabled: boolean;
  onJoin(team: TeamIndex): void;
  /** The host's manage sheet for another player (S7-87); omitted for guests. */
  onManage?: ((playerId: string) => void) | undefined;
};

export function TeamColumns({
  players,
  hostId,
  selfId,
  disabled,
  onJoin,
  onManage,
}: TeamColumnsProps) {
  const room = { mode: 'versus' as const, players: [...players] };
  return (
    <>
      <div className={styles.columns}>
        {TEAMS.map((team) => {
          const members = teamPlayers(players, team);
          const name = teamName(team);
          const titleId = `team-${team}-title`;
          return (
            <section
              key={team}
              className={styles.column}
              aria-labelledby={titleId}
              data-testid={`team-${team}`}
            >
              <h2 id={titleId} className={styles.head}>
                <TeamBadge team={team} size={34} />
                <span className={styles.teamName}>{name}</span>
                <span className={styles.count}>
                  {pl.lobbyRoom.teamCount(members.length, MAX_TEAM_PLAYERS)}
                </span>
              </h2>
              <ol className={styles.cards}>
                {members.map((player) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    isMe={player.id === selfId}
                    isHost={player.id === hostId}
                    compact
                    onManage={
                      onManage && player.id !== selfId ? () => onManage(player.id) : undefined
                    }
                    manageDisabled={disabled}
                  />
                ))}
                {members.length < MAX_TEAM_PLAYERS && (
                  <li className={styles.seat}>
                    {canJoinTeam(room, selfId, team) ? (
                      <Button
                        icon={<Icon name="swap" size={22} />}
                        disabled={disabled}
                        data-testid={`join-team-${team}`}
                        onClick={() => onJoin(team)}
                      >
                        {pl.lobbyRoom.joinTeam}
                      </Button>
                    ) : (
                      pl.lobby.emptySlot
                    )}
                  </li>
                )}
              </ol>
            </section>
          );
        })}
      </div>
      {unevenTeams(room) && (
        <p className={styles.uneven} data-testid="teams-uneven">
          <Icon name="flag" size={20} />
          {pl.lobbyRoom.uneven}
        </p>
      )}
    </>
  );
}
