import { useViewRoster } from '../net/view-context.tsx';
import { PlayerAvatar } from './PlayerAvatar.tsx';

export function Players({ shadows }: { shadows: boolean }) {
  const players = useViewRoster();
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
