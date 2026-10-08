// Idle newsroom life (S3-07): ceiling fans turning, a wall clock ticking, monitors with a gentle
// screen glow, paper stacks that wobble when someone walks past, and (high preset only) dust
// motes drifting along the side walls. Everything is decoration on decorative furniture and
// walls (ambience-layout.ts), built from palette tokens and kept to a handful of draw calls:
// one merged static mesh plus one instanced mesh per moving part. No flicker: the screens breathe
// slowly and stay steady under no-flash; no wobble with reduced motion.
import { useFrame } from '@react-three/fiber';
import { type RefObject, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  InstancedBufferAttribute,
  type InstancedMesh,
  Object3D,
} from 'three';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { type AmbienceLayout, ambienceLayout, type PropTile } from './ambience-layout.ts';
import { ELEVATION } from './CameraRig.tsx';
import { box, cylinder, merge, mergePainted, ring, useGeometries } from './geometry.ts';
import { useQuality } from './quality.ts';
import { renderState } from './render-state.ts';

const DESK_TOP_Y = 0.72;
/** Fan hub height; the fan is shifted forward so that, seen from the camera, it hangs over its tile. */
const FAN_Y = 1.75;
// Perspective makes high things drift less than the parallel-projection estimate: scale it down.
const FAN_SHIFT = (0.7 * FAN_Y) / Math.tan(ELEVATION);
const FAN_SPEED = 2.4;
/** Wall clock centre on the back wall's front face (the wall block ends at z = 1). */
const CLOCK_Y = 0.98;
const CLOCK_Z = 1.03;
/** Clock hands: one turn a minute and one every twelve, like a sped-up office clock. */
const MINUTE_TURN_S = 60;
const HOUR_TURN_S = 720;
/** Screen glow: a slow breath between two light blues, out of phase per monitor. */
const GLOW_PERIOD_S = 4.5;
/** Paper stacks: how close a walking player must pass, and how hard the stack is nudged. */
const WOBBLE_RADIUS = 1.2;
const WOBBLE_KICK = 4;
const WOBBLE_MAX = 0.2;
const MOTES_PER_COLUMN = 18;

const dummy = new Object3D();

function staticParts(layout: AmbienceLayout): BufferGeometry {
  const navy: BufferGeometry[] = [];
  const white: BufferGeometry[] = [];
  const soft: BufferGeometry[] = [];
  const sunk: BufferGeometry[] = [];
  for (const fan of layout.fans) {
    navy.push(cylinder(0.03, 0.7, { x: fan.x, y: FAN_Y + 0.38, z: fan.z + FAN_SHIFT }, 6));
  }
  const clock = layout.clock;
  if (clock) {
    const at = { x: clock.x, y: CLOCK_Y, z: CLOCK_Z };
    white.push(cylinder(0.27, 0.04, { ...at, rx: Math.PI / 2 }, 20));
    navy.push(ring(0.29, 0.045, { ...at, z: CLOCK_Z + 0.015 }));
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      navy.push(
        box(0.04, 0.07, 0.02, {
          x: clock.x + Math.sin(a) * 0.2,
          y: CLOCK_Y + Math.cos(a) * 0.2,
          z: CLOCK_Z + 0.03,
          rz: -a,
        }),
      );
    }
    navy.push(cylinder(0.035, 0.03, { ...at, z: CLOCK_Z + 0.04, rx: Math.PI / 2 }, 8));
  }
  for (const m of layout.monitors) {
    const y = DESK_TOP_Y;
    navy.push(box(0.26, 0.03, 0.16, { x: m.x, y: y + 0.0125, z: m.z - 0.1 }));
    navy.push(box(0.07, 0.18, 0.06, { x: m.x, y: y + 0.11, z: m.z - 0.12 }));
    navy.push(box(0.56, 0.38, 0.07, { x: m.x, y: y + 0.36, z: m.z - 0.12 }));
    sunk.push(box(0.32, 0.02, 0.11, { x: m.x, y: y + 0.01, z: m.z + 0.17 }));
    soft.push(box(0.1, 0.012, 0.13, { x: m.x + 0.26, y: y + 0.006, z: m.z + 0.17 }));
  }
  if (navy.length + white.length + soft.length + sunk.length === 0) {
    return merge([box(0.001, 0.001, 0.001, { y: -1 })]);
  }
  return mergePainted([
    [colors.outline, navy],
    [colors.surface, white],
    [colors.surfaceSoft, soft],
    [colors.surfaceSunk, sunk],
  ]);
}

/** One fan: navy hub and three wooden blades in the XZ plane around the origin. */
function fanGeometry(): BufferGeometry {
  const blades = [0, 1, 2].map((i) =>
    new BoxGeometry(0.56, 0.03, 0.16).translate(0.36, 0, 0).rotateY((i * 2 * Math.PI) / 3),
  );
  return mergePainted([
    [colors.outline, [cylinder(0.08, 0.08, {}, 10)]],
    [colors.surface, blades],
  ]);
}

/** Clock hand pivoting at its base (scaled to length per instance). */
function handGeometry(): BufferGeometry {
  return mergePainted([[colors.outline, [new BoxGeometry(0.035, 1, 0.02).translate(0, 0.5, 0)]]]);
}

/** A stack of paper with its base at the origin (pivot for the wobble). */
function stackGeometry(): BufferGeometry {
  const sheets = [0, 1, 2, 3, 4].map((i) =>
    box(0.3, 0.022, 0.22, { y: 0.011 + i * 0.024, ry: ((i * 37) % 7) * 0.04 - 0.12 }),
  );
  // Alternate white and pale-blue sheets (never folder yellow: folders are interactive).
  return mergePainted([
    [colors.surface, sheets.filter((_, i) => i % 2 === 0)],
    [colors.surfaceSunk, sheets.filter((_, i) => i % 2 === 1)],
  ]);
}

function useInstanceColors(mesh: RefObject<InstancedMesh | null>, count: number): void {
  // Create the colour attribute before the first render: adding it later recompiles the shader.
  useLayoutEffect(() => {
    const m = mesh.current;
    if (m && count > 0 && !m.instanceColor) {
      m.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
    }
  }, [mesh, count]);
}

export function Ambience() {
  const detail = useQuality((s) => s.profile.detail);
  const preset = useQuality((s) => s.profile.preset);
  const layout = useMemo(() => ambienceLayout(runtime.map), []);
  const g = useGeometries(() => ({
    static: staticParts(layout),
    fan: fanGeometry(),
    hand: handGeometry(),
    stack: stackGeometry(),
    screen: new BoxGeometry(0.47, 0.29, 0.01),
    mote: new BoxGeometry(0.035, 0.035, 0.035),
  }));

  const fans = useRef<InstancedMesh>(null);
  const hands = useRef<InstancedMesh>(null);
  const screens = useRef<InstancedMesh>(null);
  const stacks = useRef<InstancedMesh>(null);
  const motes = useRef<InstancedMesh>(null);
  const showMotes = preset === 'high';
  const moteCount = showMotes ? MOTES_PER_COLUMN * layout.motes.length : 0;
  useInstanceColors(screens, layout.monitors.length);

  const wobble = useMemo(
    () =>
      layout.stacks.map(() => ({
        spring: { value: 0, velocity: 0 } as SpringState,
        axisX: 1,
        axisZ: 0,
        near: false,
      })),
    [layout],
  );
  const moteSeeds = useMemo(
    () =>
      Array.from({ length: MOTES_PER_COLUMN * layout.motes.length }, (_, i) => ({
        column: layout.motes[Math.floor(i / MOTES_PER_COLUMN)] ?? { x: 0, z: 0 },
        angle: (i * 2.399) % (Math.PI * 2),
        radius: 0.15 + ((i * 0.618) % 1) * 0.65,
        phase: i * 1.7,
        speed: 0.05 + ((i * 0.37) % 1) * 0.07,
      })),
    [layout],
  );
  const glowA = useMemo(() => new Color(colors.sky), []);
  const glowB = useMemo(() => new Color(colors.wallTop), []);
  const glow = useMemo(() => new Color(), []);

  // Static placement of the screens (colours change per frame) and paper stacks.
  useLayoutEffect(() => {
    const s = screens.current;
    if (s) {
      layout.monitors.forEach((m, i) => {
        dummy.position.set(m.x, DESK_TOP_Y + 0.36, m.z - 0.08);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        s.setMatrixAt(i, dummy.matrix);
        s.setColorAt(i, glowB);
      });
      s.instanceMatrix.needsUpdate = true;
      if (s.instanceColor) {
        s.instanceColor.needsUpdate = true;
      }
      s.computeBoundingSphere();
    }
  }, [layout, glowB]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const { reducedMotion, noFlash } = useSettings.getState();

    const f = fans.current;
    if (f) {
      layout.fans.forEach((fan, i) => {
        dummy.position.set(fan.x, FAN_Y, fan.z + FAN_SHIFT);
        dummy.rotation.set(0, t * FAN_SPEED + i * 0.9, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        f.setMatrixAt(i, dummy.matrix);
      });
      f.instanceMatrix.needsUpdate = true;
    }

    const h = hands.current;
    const c = layout.clock;
    if (h && c) {
      const turns: [number, number, number][] = [
        [MINUTE_TURN_S, 0.21, 0.004],
        [HOUR_TURN_S, 0.14, 0.008],
      ];
      turns.forEach(([period, length, dz], i) => {
        // The minute hand steps once a second like a real office clock.
        const time = i === 0 ? Math.floor(t) : t;
        dummy.position.set(c.x, CLOCK_Y, CLOCK_Z + 0.045 + dz);
        dummy.rotation.set(0, 0, -((time / period) % 1) * Math.PI * 2);
        dummy.scale.set(i === 1 ? 1.4 : 1, length, 1);
        dummy.updateMatrix();
        h.setMatrixAt(i, dummy.matrix);
      });
      h.instanceMatrix.needsUpdate = true;
    }

    const s = screens.current;
    if (s?.instanceColor) {
      layout.monitors.forEach((_, i) => {
        const k = noFlash ? 0.5 : 0.5 + 0.5 * Math.sin((t / GLOW_PERIOD_S) * Math.PI * 2 + i * 2.1);
        glow.copy(glowA).lerp(glowB, k);
        s.setColorAt(i, glow);
      });
      s.instanceColor.needsUpdate = true;
    }

    const st = stacks.current;
    if (st) {
      layout.stacks.forEach((tile: PropTile, i) => {
        const w = wobble[i];
        if (!w) {
          return;
        }
        if (detail && !reducedMotion) {
          let near = false;
          for (const player of renderState.players.values()) {
            const dx = tile.x - player.x;
            const dz = tile.z - player.y;
            if (player.moving && dx * dx + dz * dz < WOBBLE_RADIUS * WOBBLE_RADIUS) {
              near = true;
              if (!w.near) {
                // Tip away from the passer-by.
                const d = Math.hypot(dx, dz) || 1;
                w.axisX = dz / d;
                w.axisZ = -dx / d;
                w.spring.velocity += WOBBLE_KICK;
              }
            }
          }
          w.near = near;
          stepSpring(w.spring, 0, delta, 2.6, 0.18);
        } else {
          w.spring.value = 0;
          w.spring.velocity = 0;
        }
        const tilt = Math.max(-WOBBLE_MAX, Math.min(WOBBLE_MAX, w.spring.value));
        dummy.position.set(tile.x + 0.08, DESK_TOP_Y, tile.z + 0.05);
        dummy.rotation.set(w.axisX * tilt, ((i * 53) % 9) * 0.1, w.axisZ * tilt);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        st.setMatrixAt(i, dummy.matrix);
      });
      st.instanceMatrix.needsUpdate = true;
    }

    const m = motes.current;
    if (m && moteCount > 0) {
      moteSeeds.forEach((seed, i) => {
        const rise = (seed.phase + t * seed.speed) % 1;
        const a = seed.angle + t * 0.15;
        dummy.position.set(
          seed.column.x + Math.cos(a) * seed.radius + Math.sin(t * 0.7 + seed.phase) * 0.06,
          0.35 + rise * 1.7,
          seed.column.z + Math.sin(a) * seed.radius,
        );
        dummy.rotation.set(t + seed.phase, t * 0.5, 0);
        // Grow in, shrink out: no fading, no popping.
        const size = Math.sin(rise * Math.PI);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group name="ambience">
      <mesh geometry={g.static}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {layout.fans.length > 0 && (
        <instancedMesh
          ref={fans}
          args={[g.fan, undefined, layout.fans.length]}
          frustumCulled={false}
        >
          <meshLambertMaterial vertexColors />
        </instancedMesh>
      )}
      {layout.clock && (
        <instancedMesh ref={hands} args={[g.hand, undefined, 2]} frustumCulled={false}>
          <meshLambertMaterial vertexColors />
        </instancedMesh>
      )}
      {layout.monitors.length > 0 && (
        <instancedMesh ref={screens} args={[g.screen, undefined, layout.monitors.length]}>
          <meshBasicMaterial />
        </instancedMesh>
      )}
      {layout.stacks.length > 0 && (
        <instancedMesh
          ref={stacks}
          args={[g.stack, undefined, layout.stacks.length]}
          frustumCulled={false}
        >
          <meshLambertMaterial vertexColors />
        </instancedMesh>
      )}
      {showMotes && (
        <instancedMesh ref={motes} args={[g.mote, undefined, moteCount]} frustumCulled={false}>
          <meshBasicMaterial color={colors.surface} />
        </instancedMesh>
      )}
    </group>
  );
}
