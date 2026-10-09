// Renders the shared particle pool as one instanced draw call of camera-facing sprites cut from
// a procedural atlas (fx/particles/sprites.ts): flat shapes with a navy outline, tinted per
// particle. Particles shrink to nothing instead of fading, matching the paper-cut look without
// alpha blending (alpha-tested, so no sorting and no overdraw cost on phones).
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  type Mesh,
  PlaneGeometry,
  ShaderMaterial,
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
  SPRITE_SCALE,
} from '../fx/particles/presets.ts';
import {
  drawSpriteAtlas,
  frameIndex,
  SPRITE_CELL,
  SPRITE_COLUMNS,
  SPRITE_ROWS,
} from '../fx/particles/sprites.ts';
import { fxTimeScale } from '../fx/time-scale.ts';
import { useSettings } from '../store/settings.ts';
import { colors as tokens } from '../ui/tokens.ts';
import { useQuality } from './quality.ts';

const between = (range: readonly [number, number]) =>
  range[0] + Math.random() * (range[1] - range[0]);

const VERTEX = `
attribute vec3 aPos;
attribute float aSize;
attribute float aRot;
attribute float aFrame;
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec4 view = modelViewMatrix * vec4(aPos, 1.0);
  float c = cos(aRot);
  float s = sin(aRot);
  vec2 p = position.xy * aSize;
  view.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * view;
  float column = mod(aFrame, ${SPRITE_COLUMNS}.0);
  float row = floor(aFrame / ${SPRITE_COLUMNS}.0);
  vUv = (vec2(column, ${SPRITE_ROWS - 1}.0 - row) + position.xy * 0.5 + 0.5)
    / vec2(${SPRITE_COLUMNS}.0, ${SPRITE_ROWS}.0);
  vColor = aColor;
}`;

const FRAGMENT = `
uniform sampler2D map;
uniform vec3 outlineColor;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec4 texel = texture2D(map, vUv);
  if (texel.a < 0.5) {
    discard;
  }
  gl_FragColor = vec4(mix(outlineColor, vColor, smoothstep(0.35, 0.65, texel.r)), 1.0);
  #include <colorspace_fragment>
}`;

function createAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_CELL * SPRITE_COLUMNS;
  canvas.height = SPRITE_CELL * SPRITE_ROWS;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    drawSpriteAtlas(ctx);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function instanced(count: number, itemSize: number): InstancedBufferAttribute {
  const attribute = new InstancedBufferAttribute(new Float32Array(count * itemSize), itemSize);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

export function Particles() {
  const preset = useQuality((s) => s.profile.preset);
  const capacity = particleCapacity[preset];
  const pool = useMemo(() => createPool(capacity), [capacity]);
  const mesh = useRef<Mesh>(null);
  const color = useMemo(() => new Color(), []);
  const warmFrames = useRef(3);

  const { geometry, material, buffers } = useMemo(() => {
    const quad = new PlaneGeometry(2, 2);
    const geo = new InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    const attributes = {
      pos: instanced(capacity, 3),
      size: instanced(capacity, 1),
      rot: instanced(capacity, 1),
      frame: instanced(capacity, 1),
      color: instanced(capacity, 3),
    };
    geo.setAttribute('aPos', attributes.pos);
    geo.setAttribute('aSize', attributes.size);
    geo.setAttribute('aRot', attributes.rot);
    geo.setAttribute('aFrame', attributes.frame);
    geo.setAttribute('aColor', attributes.color);
    geo.instanceCount = 0;
    const mat = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        map: { value: createAtlas() },
        outlineColor: { value: new Color(tokens.outline) },
      },
    });
    return { geometry: geo, material: mat, buffers: attributes };
  }, [capacity]);

  useLayoutEffect(() => {
    warmFrames.current = 3;
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.uniforms.map?.value.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(
    () =>
      feedback.connect({
        spawnParticles(id: ParticlePresetId, count: number, context: CueContext) {
          const position = context.position;
          if (!position) {
            return;
          }
          const p: EmitterPreset = particlePresets[id];
          const palette = p.colors ?? [context.color ?? tokens.outline, ...(p.accent ?? [])];
          const frames = p.frames ?? ['square'];
          const spins = p.spin && !useSettings.getState().reducedMotion ? p.spin : null;
          for (let i = 0; i < count; i++) {
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
              size: between(p.size) * SPRITE_SCALE,
              gravity: p.gravity,
              drag: p.drag,
              color: color
                .set(palette[Math.floor(Math.random() * palette.length)] ?? tokens.outline)
                .getHex(),
              frame: frameIndex(frames[Math.floor(Math.random() * frames.length)] ?? 'square'),
              rot: Math.random() * Math.PI * 2,
              spin: spins ? between(spins) * (Math.random() < 0.5 ? -1 : 1) : 0,
            });
          }
        },
      }),
    [pool, color],
  );

  useFrame((_, delta) => {
    stepPool(pool, Math.min(delta, 0.1) * fxTimeScale());
    const pos = buffers.pos.array as Float32Array;
    const sizes = buffers.size.array as Float32Array;
    const rots = buffers.rot.array as Float32Array;
    const frames = buffers.frame.array as Float32Array;
    const cols = buffers.color.array as Float32Array;
    let n = 0;
    for (let i = 0; i < pool.capacity; i++) {
      if (!pool.alive[i]) {
        continue;
      }
      const scale = scaleAt(pool, i);
      pos[n * 3] = pool.px[i] ?? 0;
      pos[n * 3 + 1] = (pool.pz[i] ?? 0) + scale;
      pos[n * 3 + 2] = pool.py[i] ?? 0;
      sizes[n] = scale;
      rots[n] = pool.rot[i] ?? 0;
      frames[n] = pool.frame[i] ?? 0;
      color.setHex(pool.color[i] ?? 0);
      cols[n * 3] = color.r;
      cols[n * 3 + 1] = color.g;
      cols[n * 3 + 2] = color.b;
      n++;
    }
    if (warmFrames.current > 0) {
      // Draw one invisible particle on the first frames so the GPU pipeline for this mesh is
      // created during load, not on the first real burst.
      warmFrames.current--;
      if (n === 0) {
        sizes[0] = 0;
        n = 1;
      }
    }
    geometry.instanceCount = n;
    buffers.pos.needsUpdate = true;
    buffers.size.needsUpdate = true;
    buffers.rot.needsUpdate = true;
    buffers.frame.needsUpdate = true;
    buffers.color.needsUpdate = true;
    particleStats.alive = pool.count;
  });

  return (
    <mesh key={capacity} ref={mesh} geometry={geometry} material={material} frustumCulled={false} />
  );
}
