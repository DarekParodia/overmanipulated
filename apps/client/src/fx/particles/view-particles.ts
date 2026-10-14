// The particle pool of one GameView (net/game-view.ts, S7-85). The renderer (scene/Particles.tsx)
// starts a fresh pool when it mounts and whenever the quality preset changes its capacity; bursts
// from the view's own feedback land only in this pool.
import { createPool, type ParticlePool } from './pool.ts';

export type ViewParticles = {
  /** The live pool (empty, zero capacity until the renderer mounts). */
  readonly pool: ParticlePool;
  /** Replaces the pool with an empty one of the given capacity and returns it. */
  reset(capacity: number): ParticlePool;
};

export function createViewParticles(): ViewParticles {
  let pool = createPool(0);
  return {
    get pool() {
      return pool;
    },
    reset(capacity) {
      pool = createPool(capacity);
      return pool;
    },
  };
}
