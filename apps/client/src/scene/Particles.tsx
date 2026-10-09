// Renders the shared particle pool as one instanced mesh of low-poly chips (one draw call).
// Particles shrink to nothing instead of fading, matching the paper-cut look without alpha.
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  MeshLambertMaterial,
  Object3D,
} from 'three';
import { particleStats } from '../debug/perf-stats.ts';
import type { CueContext } from '../fx/feedback.ts';
import { feedback } from '../fx/feedback.ts';
import { createPool, scaleAt, spawn, stepPool } from '../fx/particles/pool.ts';
import {
  type EmitterPreset,
  type ParticlePresetId,
  particleCapacity,
  particlePresets,
} from '../fx/particles/presets.ts';
import { fxTimeScale } from '../fx/time-scale.ts';
import { colors as tokens } from '../ui/tokens.ts';
import { useQuality } from './quality.ts';

const between = (range: readonly [number, number]) =>
  range[0] + Math.random() * (range[1] - range[0]);

export function Particles() {
  const preset = useQuality((s) => s.profile.preset);
  const capacity = particleCapacity[preset];
  const pool = useMemo(() => createPool(capacity), [capacity]);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new IcosahedronGeometry(1, 0), []);
  const material = useMemo(() => new MeshLambertMaterial({ flatShading: true }), []);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const warmFrames = useRef(3);

  // Create the per-instance colour attribute before the first render: adding it later changes the
  // shader defines and forces a recompile (a 100+ ms stall) on the first particle burst.
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (instanced && !instanced.instanceColor) {
      instanced.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      instanced.count = 0;
      warmFrames.current = 3;
    }
  }, [capacity]);

  useEffect(
    () =>
      feedback.connect({
        spawnParticles(id: ParticlePresetId, count: number, context: CueContext) {
          const position = context.position;
          if (!position) {
            return;
          }
          const p: EmitterPreset = particlePresets[id];
          const colors = p.colors ?? [context.color ?? tokens.outline, ...(p.accent ?? [])];
          // Adaptive quality cuts the number of particles per burst, never the effect itself.
          const scaled = Math.max(
            1,
            Math.round(count * useQuality.getState().profile.particleScale),
          );
          for (let i = 0; i < scaled; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = between(p.speed);
            spawn(pool, {
              x: position.x + Math.cos(angle) * 0.1,
              y: position.y + Math.sin(angle) * 0.1,
              z: p.height,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              vz: between(p.rise),
              life: between(p.life),
              size: between(p.size),
              gravity: p.gravity,
              drag: p.drag,
              color: color
                .set(colors[Math.floor(Math.random() * colors.length)] ?? tokens.outline)
                .getHex(),
            });
          }
        },
      }),
    [pool, color],
  );

  useFrame((_, delta) => {
    const instanced = mesh.current;
    if (!instanced) {
      return;
    }
    stepPool(pool, Math.min(delta, 0.1) * fxTimeScale());
    let n = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (!pool.alive[i]) {
        continue;
      }
      const scale = scaleAt(pool, i);
      dummy.position.set(pool.px[i] ?? 0, (pool.pz[i] ?? 0) + scale, pool.py[i] ?? 0);
      dummy.rotation.set(i, i * 0.7, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(n, dummy.matrix);
      instanced.setColorAt(n, color.setHex(pool.color[i] ?? 0));
      n++;
    }
    if (warmFrames.current > 0) {
      // Draw one invisible particle on the first frames so the GPU pipeline for this mesh is
      // created during load, not on the first real burst.
      warmFrames.current--;
      if (n === 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        instanced.setMatrixAt(0, dummy.matrix);
        n = 1;
      }
    }
    instanced.count = n;
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) {
      instanced.instanceColor.needsUpdate = true;
    }
    particleStats.alive = pool.count;
  });

  return (
    <instancedMesh
      key={capacity}
      ref={mesh}
      args={[geometry, material, capacity]}
      frustumCulled={false}
    />
  );
}
