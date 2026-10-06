// Station and desk state in the world: a paper dial above the fixture, tilted to face the camera
// like a kitchen timer. Working fills the dial in ink with progress; a minigame shows a "busy"
// dial in the operator's colour with three ink dots; lockout drains a red sector under an ink
// cross; an occupied desk shows the busy dial. A tab in the operator's colour marks who works.

import { useFrame } from '@react-three/fiber';
import type { Fixture, Station } from '@redakcja/shared';
import { useEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  CircleGeometry,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshLambertMaterial,
  RingGeometry,
} from 'three';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { palette, playerColor } from '../ui/tokens.ts';
import { ELEVATION } from './CameraRig.tsx';
import { type StationIndicator, stationIndicator, surfaceHeight } from './entities.ts';
import { box, mergePainted, useGeometries } from './geometry.ts';

/** Tilted back by the camera elevation so the dial faces the camera. */
const FACE_CAMERA_X = -ELEVATION;
const DIAL_ABOVE_SURFACE = 0.62;
const FILL_SEGMENTS = 40;
const FILL_RATE = 12;

type Shared = {
  /** Paper disc with ink rim, plain / with busy dots / with lockout cross (vertex colours). */
  plain: BufferGeometry;
  busy: BufferGeometry;
  lockout: BufferGeometry;
  fill: CircleGeometry;
  tab: BufferGeometry;
};
type RoomPlayers = readonly { id: string; colorIndex: number }[] | undefined;

function operatorColor(players: RoomPlayers, operatorId: string | null): string {
  if (!operatorId) {
    return palette.inkFaint;
  }
  const player = players?.find((p) => p.id === operatorId);
  return player ? playerColor(player.colorIndex) : palette.inkFaint;
}

function indicatorFor(fixture: Fixture): StationIndicator {
  const state = useGame.getState();
  if (fixture.kind === 'desk') {
    const desk = state.desks.find((d) => d.id === fixture.id);
    return desk?.operatorId ? { kind: 'busy', operatorId: desk.operatorId } : { kind: 'none' };
  }
  const station: Station | undefined = state.stations.find((s) => s.id === fixture.id);
  return stationIndicator(station);
}

function Dial({ fixture, shared }: { fixture: Fixture; shared: Shared }) {
  const root = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const fillMaterial = useRef<MeshLambertMaterial>(null);
  const tab = useRef<Mesh>(null);
  const tabMaterial = useRef<MeshLambertMaterial>(null);
  const face = useRef<Mesh>(null);
  const pop = useRef<SpringState>({ value: 0, velocity: 0 });
  const shown = useRef({ kind: 'none' as StationIndicator['kind'], fraction: 0 });
  // Colours are resolved only when the operator, the kind or the roster changes.
  const players = useApp((s) => s.room?.players);
  const painted = useRef({ key: '', players: undefined as RoomPlayers });

  useFrame((_, delta) => {
    const group = root.current;
    if (!group || !fill.current || !fillMaterial.current || !tab.current || !tabMaterial.current) {
      return;
    }
    const indicator = indicatorFor(fixture);
    const reducedMotion = useSettings.getState().reducedMotion;
    if (indicator.kind === 'none') {
      group.visible = false;
      shown.current.kind = 'none';
      return;
    }
    const target = indicator.kind === 'busy' ? 1 : indicator.fraction;
    if (indicator.kind !== shown.current.kind) {
      if (shown.current.kind === 'none') {
        pop.current.value = reducedMotion ? 1 : 0.4;
        pop.current.velocity = 0;
      }
      shown.current.kind = indicator.kind;
      shown.current.fraction = target;
    }
    const k = reducedMotion ? 1 : 1 - Math.exp(-FILL_RATE * delta);
    shown.current.fraction += (target - shown.current.fraction) * k;
    stepSpring(pop.current, 1, delta, 4, 0.5);

    group.visible = true;
    group.scale.setScalar(reducedMotion ? 1 : pop.current.value);
    const segments = Math.round(shown.current.fraction * FILL_SEGMENTS);
    fill.current.geometry.setDrawRange(0, segments * 3);
    fill.current.visible = segments > 0;

    const operatorId = indicator.kind === 'lockout' ? null : indicator.operatorId;
    tab.current.visible = operatorId !== null;
    const key = `${indicator.kind}|${operatorId ?? ''}`;
    if (key !== painted.current.key || players !== painted.current.players) {
      painted.current = { key, players };
      const color = operatorColor(players, operatorId);
      fillMaterial.current.color.set(
        indicator.kind === 'lockout'
          ? palette.editorialRed
          : indicator.kind === 'busy'
            ? color
            : palette.ink,
      );
      tabMaterial.current.color.set(color);
    }
    if (face.current) {
      face.current.geometry =
        indicator.kind === 'busy'
          ? shared.busy
          : indicator.kind === 'lockout'
            ? shared.lockout
            : shared.plain;
    }
  });

  // Each dial owns its fill geometry: the draw range (progress) is per dial.
  const fillGeometry = useMemo(() => shared.fill.clone(), [shared.fill]);
  useEffect(() => () => fillGeometry.dispose(), [fillGeometry]);

  return (
    <group
      ref={root}
      name={`station-dial:${fixture.id}`}
      position={[fixture.col + 0.5, surfaceHeight(fixture) + DIAL_ABOVE_SURFACE, fixture.row + 0.5]}
      rotation-x={FACE_CAMERA_X}
      visible={false}
    >
      <mesh geometry={shared.tab} ref={tab} position={[0, 0.25, -0.004]}>
        <meshLambertMaterial ref={tabMaterial} />
      </mesh>
      <mesh ref={face} geometry={shared.plain}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {/* Mirrored so the sector fills clockwise from twelve o'clock. */}
      <mesh ref={fill} geometry={fillGeometry} position-z={0.003} scale-x={-1}>
        <meshLambertMaterial ref={fillMaterial} side={DoubleSide} />
      </mesh>
    </group>
  );
}

export function StationIndicators() {
  const fixtures = useMemo(
    () => runtime.map.fixtures.filter((f) => f.kind === 'station' || f.kind === 'desk'),
    [],
  );
  const shared = useGeometries((): Shared => {
    const face = (marks: BufferGeometry[]) =>
      mergePainted([
        [palette.paper, [new CircleGeometry(0.2, 28)]],
        [palette.ink, [new RingGeometry(0.2, 0.235, 28), ...marks]],
      ]);
    // Marks sit in front of the fill sector (which is drawn at z 0.003).
    return {
      plain: face([]),
      busy: face([-0.07, 0, 0.07].map((x) => box(0.04, 0.04, 0.004, { x, z: 0.006 }))),
      lockout: face([
        box(0.26, 0.045, 0.004, { z: 0.006, rz: Math.PI / 4 }),
        box(0.26, 0.045, 0.004, { z: 0.006, rz: -Math.PI / 4 }),
      ]),
      fill: new CircleGeometry(0.165, FILL_SEGMENTS, Math.PI / 2, Math.PI * 2),
      tab: box(0.12, 0.09, 0.004),
    };
  });
  return (
    <>
      {fixtures.map((fixture) => (
        <Dial key={fixture.id} fixture={fixture} shared={shared} />
      ))}
    </>
  );
}
