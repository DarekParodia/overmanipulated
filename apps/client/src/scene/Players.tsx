// The avatars of the view's newsroom (S7-90): a player sees their own team, a spectator view the
// team it watches; in co-op everyone is in team 0.
import { useGameView } from '../net/view-context.tsx';
import { selfTeam, useApp } from '../store/app.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export function Players({ shadows }: { shadows: boolean }) {
  const view = useGameView();
  const players = useApp((s) => s.room?.players);
  const team = useApp((s) =>
    view.kind === 'spectator' ? view.team : selfTeam(s.room, s.playerId),
  );
  return (
    <>
      {(players ?? [])
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
