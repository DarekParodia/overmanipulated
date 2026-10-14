// Runs before every other frame callback: advances the view's runtime (input ticks for the
// player's view) and samples its render state. `local` is the subject's position: the local
// player's in the player view, the followed player's in a spectator view (S7-85) and the
// scripted reporter's in the intro (S7-101).
import { useFrame } from '@react-three/fiber';
import { useGameView } from '../net/view-context.tsx';

/** Frame callbacks with lower priority run first; negative keeps R3F's automatic rendering. */
const DRIVER_PRIORITY = -10;

export function Driver() {
  const view = useGameView();
  useFrame((_, delta) => {
    const { runtime, render } = view;
    const dtMs = Math.min(delta * 1000, 250);
    render.players = runtime.frame(performance.now(), dtMs);
    const followed = view.kind === 'player' ? null : view.subjectId();
    let local: { x: number; y: number } | null = null;
    for (const player of render.players.values()) {
      if (followed === null ? player.local : player.id === followed) {
        local = { x: player.x, y: player.y };
      }
    }
    render.local = local;
  }, DRIVER_PRIORITY);
  return null;
}
