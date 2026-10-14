// The avatars of the view's newsroom (S7-90): a player sees their own team, a spectator view the
// team it watches, the intro its own roster (S7-101); in co-op everyone is in team 0.
import { useGameView, useViewRoster } from '../net/view-context.tsx';
import { selfTeam, useApp } from '../store/app.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export function Players({ shadows }: { shadows: boolean }) {
  const view = useGameView();
  const players = useViewRoster();
  const team = useApp((s) => (view.kind === 'player' ? selfTeam(s.room, s.playerId) : view.team));
  return (
    <>
      {players
        .filter((player) => player.team === team)
        .map((player) => (
          <PlayerAvatar
            key={player.id}
            id={player.id}
            nickname={player.nickname}
            colorIndex={player.colorIndex}
            role={player.role}
            shadows={shadows}
          />
        ))}
    </>
  );
}
