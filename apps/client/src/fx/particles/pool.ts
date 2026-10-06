// Fixed-capacity particle pool with struct-of-arrays storage: no allocation after creation.
// World units are tiles; z is height.

export type ParticlePool = {
  capacity: number;
  alive: Uint8Array;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  size: Float32Array;
  gravity: Float32Array;
  drag: Float32Array;
  /** Packed 0xRRGGBB. */
  color: Uint32Array;
  /** Index where the next search for a free slot starts. */
  cursor: number;
  count: number;
};

export function createPool(capacity: number): ParticlePool {
  return {
    capacity,
    alive: new Uint8Array(capacity),
    px: new Float32Array(capacity),
    py: new Float32Array(capacity),
    pz: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    size: new Float32Array(capacity),
    gravity: new Float32Array(capacity),
    drag: new Float32Array(capacity),
    color: new Uint32Array(capacity),
    cursor: 0,
    count: 0,
  };
}

export type ParticleInit = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  gravity: number;
  drag: number;
  color: number;
};

/** Spawns a particle; when full, recycles the oldest-found slot at the cursor. */
export function spawn(pool: ParticlePool, init: ParticleInit): number {
  let index = -1;
  for (let i = 0; i < pool.capacity; i++) {
    const candidate = (pool.cursor + i) % pool.capacity;
    if (!pool.alive[candidate]) {
      index = candidate;
      break;
    }
  }
  if (index === -1) {
    index = pool.cursor;
  } else {
    pool.count++;
  }
  pool.cursor = (index + 1) % pool.capacity;
  pool.alive[index] = 1;
  pool.px[index] = init.x;
  pool.py[index] = init.y;
  pool.pz[index] = init.z;
  pool.vx[index] = init.vx;
  pool.vy[index] = init.vy;
  pool.vz[index] = init.vz;
  pool.life[index] = init.life;
  pool.maxLife[index] = init.life;
  pool.size[index] = init.size;
  pool.gravity[index] = init.gravity;
  pool.drag[index] = init.drag;
  pool.color[index] = init.color;
  return index;
}

/** Integrates all live particles; dead ones are freed. */
export function stepPool(pool: ParticlePool, dtSeconds: number): void {
  for (let i = 0; i < pool.capacity; i++) {
    if (!pool.alive[i]) {
      continue;
    }
    const life = (pool.life[i] ?? 0) - dtSeconds;
    pool.life[i] = life;
    if (life <= 0) {
      pool.alive[i] = 0;
      pool.count--;
      continue;
    }
    const damping = Math.max(0, 1 - (pool.drag[i] ?? 0) * dtSeconds);
    const vx = (pool.vx[i] ?? 0) * damping;
    const vy = (pool.vy[i] ?? 0) * damping;
    let vz = ((pool.vz[i] ?? 0) - (pool.gravity[i] ?? 0) * dtSeconds) * damping;
    let pz = (pool.pz[i] ?? 0) + vz * dtSeconds;
    if (pz < 0) {
      pz = 0;
      vz = 0;
    }
    pool.vx[i] = vx;
    pool.vy[i] = vy;
    pool.vz[i] = vz;
    pool.px[i] = (pool.px[i] ?? 0) + vx * dtSeconds;
    pool.py[i] = (pool.py[i] ?? 0) + vy * dtSeconds;
    pool.pz[i] = pz;
  }
}

/** Visual scale over life: quick grow, then shrink to nothing (paper-cut look, no alpha). */
export function scaleAt(pool: ParticlePool, index: number): number {
  const maxLife = pool.maxLife[index] ?? 1;
  const t = 1 - (pool.life[index] ?? 0) / maxLife;
  const grow = Math.min(1, t / 0.15);
  const shrink = 1 - Math.max(0, (t - 0.4) / 0.6);
  return (pool.size[index] ?? 0) * grow * shrink;
}
