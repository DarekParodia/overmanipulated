// Level event pieces in the 3D scene (S4-05..S4-09):
// - outage: a flat navy "powered down" cover over each station that is down (one draw call per
//   down station) and sparks + smoke bursting off it every second or so (cue
//   `event.outage.spark`); the countdown sign itself lives in StationIndicators;
// - correction: a trail of yellow dots on the floor from the correction folder to the nearest
//   editorial desk (one instanced mesh), marching towards the desk unless motion is reduced.
import { useFrame, useThree } from '@react-three/fiber';
import {
  EVENT_OUTAGE_SPARK_EVERY_S,
  type Fixture,
  fixtureById,
  tileCenter,
} from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  CylinderGeometry,
  type Group,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three';
import { emitCue } from '../fx/feedback.ts';
import { fxTimeScale } from '../fx/time-scale.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { surfaceHeight } from './entities.ts';

/** At most this many stations are down at once (a pool of covers). */
const COVER_POOL = 3;
const COVER_PAD = 0.04;
/** The cover reaches this far above the station's surface. */
const COVER_HEIGHT = 0.55;
const DOTS_PER_TRAIL = 14;
const TRAILS = 2;
const DOT_RADIUS = 0.15;
const MARCH_SPEED = 0.9;

const point = new Vector3();

export function EventsWorld() {
  return (
    <>
      <OutageCovers />
      <CorrectionTrails />
    </>
  );
}

function OutageCovers() {
  const covers = useRef<(Group | null)[]>([]);
  const sparkClock = useRef(new Map<string, number>());
  const material = useMemo(
    () => new MeshBasicMaterial({ color: colors.outline, transparent: true, opacity: 0.55 }),
    [],
  );

  useFrame((_, delta) => {
    const { stations } = useGame.getState();
    const down: { station: (typeof stations)[number]; fixture: Fixture }[] = [];
    for (const station of stations) {
      const fixture = station.outageMs > 0 ? fixtureById(runtime.map, station.id) : undefined;
      if (fixture) {
        down.push({ station, fixture });
      }
    }
    for (let i = 0; i < COVER_POOL; i++) {
      const cover = covers.current[i];
      const entry = down[i];
      if (!cover) {
        continue;
      }
      cover.visible = entry !== undefined;
      if (entry) {
        const height = surfaceHeight(entry.fixture) + COVER_HEIGHT;
        cover.position.set(entry.fixture.col + 0.5, height / 2, entry.fixture.row + 0.5);
        cover.scale.y = height;
      }
    }
    // Sparks and smoke while the station is down (a new burst every second or so).
    const step = delta * fxTimeScale();
    const clocks = sparkClock.current;
    const downIds = new Set(down.map((d) => d.station.id));
    for (const id of [...clocks.keys()]) {
      if (!downIds.has(id)) {
        clocks.delete(id);
      }
    }
    const slow = useSettings.getState().reducedMotion ? 2 : 1;
    for (const { station, fixture } of down) {
      const clock = (clocks.get(station.id) ?? 0) - step;
      if (clock <= 0) {
        const center = tileCenter(fixture.col, fixture.row);
        emitCue('event.outage.spark', { position: center, fixtureId: station.id });
        clocks.set(station.id, (EVENT_OUTAGE_SPARK_EVERY_S + Math.random() * 0.6) * slow);
      } else {
        clocks.set(station.id, clock);
      }
    }
  });

  return (
    <>
      {Array.from({ length: COVER_POOL }, (_, i) => (
        <group
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool of identical covers
          key={i}
          name="event-outage-cover"
          visible={false}
          ref={(el) => {
            covers.current[i] = el;
          }}
        >
          <mesh material={material}>
            <boxGeometry args={[1 + COVER_PAD, 1, 1 + COVER_PAD]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function CorrectionTrails() {
  const mesh = useRef<InstancedMesh>(null);
  const scene = useThree((s) => s.scene);
  const geometry = useMemo(() => new CylinderGeometry(DOT_RADIUS, DOT_RADIUS, 0.03, 10), []);
  const material = useMemo(() => new MeshBasicMaterial({ color: colors.yellow }), []);
  const dummy = useMemo(() => new Object3D(), []);
  const from = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    if (mesh.current) {
      mesh.current.count = 0;
    }
  }, []);

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced) {
      return;
    }
    const { folders } = useGame.getState();
    const desks = runtime.map.fixtures.filter((f) => f.kind === 'desk');
    const march = useSettings.getState().reducedMotion ? 0 : (clock.elapsedTime * MARCH_SPEED) % 1;
    let n = 0;
    let trails = 0;
    for (const folder of folders) {
      if (folder.tag?.kind !== 'correction' || trails >= TRAILS || desks.length === 0) {
        continue;
      }
      // A folder already on a desk needs no trail.
      if (folder.location.kind === 'fixture') {
        const at = fixtureById(runtime.map, folder.location.fixtureId);
        if (at?.kind === 'desk') {
          continue;
        }
      }
      const group = scene.getObjectByName(`folder:${folder.id}`);
      if (!group) {
        continue;
      }
      group.getWorldPosition(from);
      let best: { x: number; y: number } | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const desk of desks) {
        const center = tileCenter(desk.col, desk.row);
        const distance = Math.hypot(center.x - from.x, center.y - from.z);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = center;
        }
      }
      if (!best) {
        continue;
      }
      trails++;
      for (let i = 0; i < DOTS_PER_TRAIL; i++) {
        const k = (i + march) / DOTS_PER_TRAIL;
        point.set(from.x + (best.x - from.x) * k, 0.05, from.z + (best.y - from.z) * k);
        // Dots shrink towards the folder, so the trail points at the desk.
        const size = 0.55 + 0.45 * k;
        dummy.position.copy(point);
        dummy.scale.set(size, 1, size);
        dummy.updateMatrix();
        instanced.setMatrixAt(n++, dummy.matrix);
      }
    }
    instanced.count = n;
    instanced.instanceMatrix.needsUpdate = true;
    instanced.visible = n > 0;
  });

  return (
    <instancedMesh
      ref={mesh}
      name="event-correction-trail"
      args={[geometry, material, DOTS_PER_TRAIL * TRAILS]}
      frustumCulled={false}
    />
  );
}
