import { useApp } from '../store/app.ts';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export function Players({ shadows }: { shadows: boolean }) {
  const players = useApp((s) => s.room?.players ?? []);
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
