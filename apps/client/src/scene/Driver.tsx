// Runs before every other frame callback: advances input ticks and samples render state.
import { useFrame } from '@react-three/fiber';
import { runtime } from '../net/session.ts';
import { renderState } from './render-state.ts';

/** Frame callbacks with lower priority run first; negative keeps R3F's automatic rendering. */
const DRIVER_PRIORITY = -10;

export function Driver() {
  useFrame((_, delta) => {
    const dtMs = Math.min(delta * 1000, 250);
    renderState.players = runtime.frame(performance.now(), dtMs);
    let local: { x: number; y: number } | null = null;
    for (const player of renderState.players.values()) {
      if (player.local) {
        local = { x: player.x, y: player.y };
      }
    }
    renderState.local = local;
  }, DRIVER_PRIORITY);
  return null;
}
