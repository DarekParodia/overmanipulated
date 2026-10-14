import { useMemo } from 'react';
import { useGameView } from '../net/view-context.tsx';
import { newsroomPlayers, selfTeam, useApp } from '../store/app.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

/**
 * The avatars of the view's newsroom (S7-89): everyone in co-op; in versus only the local
 * player's team (player view) or the watched team (spectator view).
 */
export function Players({ shadows }: { shadows: boolean }) {
  const view = useGameView();
  const room = useApp((s) => s.room);
  const team = useApp((s) => (view.kind === 'player' ? selfTeam(s.room, s.playerId) : view.team));
  const players = useMemo(() => newsroomPlayers(room, team), [room, team]);
  return (
    <>
      {players.map((player) => (
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
