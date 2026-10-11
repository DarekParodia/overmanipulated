// Interactive fixtures from the tile map, drawn as chunky outlined toys (design-rules §7) that
// pop from the decoration: stations stand on a white plinth, each with its own silhouette
// (station-models.ts), the conveyor is a slate frame with yellow/navy hazard rails, a scrolling
// belt with arrows and an intake hatch in the wall, the editorial desk carries three stamp pads
// (publish green, context orange, reject red), layout tables a white sheet with blue corners.
// Every prop is one vertex-coloured geometry with its navy outline merged in (models.ts), so a
// station costs one draw call and repeated fixtures are a single instanced draw. Each fixture
// also gets a group named `fixture:<id>` at its tile centre for tests.

import { useFrame } from '@react-three/fiber';
import type { StationKind } from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type BufferGeometry, type InstancedMesh, Object3D, type Texture } from 'three';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { isFirstDeskTile } from './entities.ts';
import { box, merge, useGeometries } from './geometry.ts';
import { buildModel, bx, bxd, cyl, cyld, type Item } from './models.ts';
import { useQuality } from './quality.ts';
import { stationGeometry } from './station-models.ts';
import { createBeltTexture, createHazardTexture } from './textures.ts';

/** Belt speed in tiles per second (texture scroll; purely cosmetic). */
const BELT_SPEED = 0.35;

type Tile = { x: number; z: number };

function InstancedPart({
  geometry,
  tiles,
  map,
  shadows,
}: {
  geometry: BufferGeometry;
  tiles: readonly Tile[];
  /** Textured parts show the texture's own colours; others use vertex colours. */
  map?: Texture;
  shadows: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    tiles.forEach((tile, i) => {
      dummy.position.set(tile.x, 0, tile.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [tiles]);
  if (tiles.length === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, tiles.length]}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      {map ? <meshLambertMaterial map={map} /> : <meshLambertMaterial vertexColors />}
    </instancedMesh>
  );
}

function StationModel({
  kind,
  shadows,
  detail,
}: {
  kind: StationKind;
  shadows: boolean;
  detail: boolean;
}) {
  const g = useGeometries(() => ({ model: stationGeometry(kind, detail) }));
  return (
    <mesh geometry={g.model} castShadow={shadows} receiveShadow={shadows}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}

function tilesOf(kind: string, filter: (id: string) => boolean = () => true): Tile[] {
  return runtime.map.fixtures
    .filter((f) => f.kind === kind && filter(f.id))
    .map((f) => ({ x: f.col + 0.5, z: f.row + 0.5 }));
}

/** Navy core of the belt and rails, outlined along z/y only so tiles join without seams. */
function beltCore(): Item {
  return {
    color: colors.outline,
    make: (g) => box(1, 0.1 + 2 * g, 0.86 + 2 * g, { y: 0.43 }),
    outline: true,
  };
}

/** Slate frame under the belt: legs with a cross brace, plus the outline of belt and rails. */
function conveyorFrame(): BufferGeometry {
  const legs = [-0.3, 0.3].flatMap((x) =>
    [-0.34, 0.34].map((z) => bx(colors.textSoft, 0.1, 0.38, 0.1, { x, y: 0.19, z })),
  );
  return buildModel([
    ...legs,
    bxd(colors.textSoft, 0.7, 0.05, 0.05, { y: 0.15, z: -0.34 }),
    bxd(colors.textSoft, 0.7, 0.05, 0.05, { y: 0.15, z: 0.34 }),
    // Navy core, hidden inside the belt and rails; only its hull shows around them.
    beltCore(),
    cyld(colors.outline, 0.05, 0.7, { y: 0.4, rx: Math.PI / 2 }, 8),
  ]);
}

/** Intake hatch in the wall at the start of a belt and a hazard end stop at its end. */
function conveyorCaps(tiles: readonly Tile[]): BufferGeometry | null {
  const has = (x: number, z: number) => tiles.some((t) => t.x === x && t.z === z);
  const parts: BufferGeometry[] = [];
  for (const tile of tiles) {
    if (!has(tile.x - 1, tile.z)) {
      parts.push(
        buildModel([
          // Frame, dark slot, rubber curtain strips and a yellow arrow into the room.
          bx(colors.textSoft, 0.1, 0.78, 1.0, { x: -0.44, y: 0.62 }),
          bxd(colors.outline, 0.06, 0.58, 0.8, { x: -0.38, y: 0.62 }),
          ...[-0.3, -0.15, 0, 0.15, 0.3].map((z) =>
            bxd(colors.blueDark, 0.03, 0.4, 0.09, { x: -0.34, y: 0.7, z }),
          ),
          bxd(colors.yellow, 0.04, 0.12, 0.3, { x: -0.4, y: 1.05 }),
        ]).translate(tile.x, 0, tile.z),
      );
    }
    if (!has(tile.x + 1, tile.z)) {
      parts.push(
        buildModel([
          bx(colors.yellowDark, 0.08, 0.24, 0.9, { x: 0.46, y: 0.56 }),
          bxd(colors.outline, 0.09, 0.05, 0.9, { x: 0.46, y: 0.6 }),
        ]).translate(tile.x, 0, tile.z),
      );
    }
  }
  return parts.length > 0 ? merge(parts) : null;
}

function sharedParts() {
  const tableLegs = [-0.4, 0.4].flatMap((x) =>
    [-0.4, 0.4].map((z) => bx(colors.furniture, 0.1, 0.62, 0.1, { x, y: 0.31, z })),
  );
  // White drop sheet with four blue corners: "put folders here".
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].flatMap((sz) => [
      bxd(colors.blue, 0.16, 0.012, 0.04, { x: sx * 0.34, y: 0.722, z: sz * 0.42 }),
      bxd(colors.blue, 0.04, 0.012, 0.16, { x: sx * 0.42, y: 0.722, z: sz * 0.34 }),
    ]),
  );
  const deskBody: Item[] = [
    bx(colors.furniture, 1, 0.64, 0.94, { y: 0.35 }),
    bx(colors.furnitureTop, 1, 0.06, 1, { y: 0.73 }),
    bxd(colors.furnitureTop, 0.4, 0.3, 0.02, { x: -0.24, y: 0.4, z: 0.47 }),
    bxd(colors.furnitureTop, 0.4, 0.3, 0.02, { x: 0.24, y: 0.4, z: 0.47 }),
    bxd(colors.outline, 0.1, 0.04, 0.03, { x: -0.24, y: 0.5, z: 0.49 }),
    bxd(colors.outline, 0.1, 0.04, 0.03, { x: 0.24, y: 0.5, z: 0.49 }),
    // Blotter.
    bx(colors.surface, 0.88, 0.012, 0.64, { y: 0.766, z: -0.02 }),
  ];
  const stamp = (x: number, color: string): Item[] => [
    bx(color, 0.2, 0.04, 0.13, { x, y: 0.79, z: 0.34 }),
    cyld(colors.outline, 0.05, 0.1, { x, y: 0.86, z: 0.34 }),
    cyl(color, 0.06, 0.04, { x, y: 0.93, z: 0.34 }),
  ];
  return {
    conveyorFrame: conveyorFrame(),
    // Yellow/navy hazard rails on both long edges (textured: one instanced draw).
    rails: merge([
      box(1, 0.14, 0.1, { y: 0.44, z: -0.39 }),
      box(1, 0.14, 0.1, { y: 0.44, z: 0.39 }),
    ]),
    belt: box(1, 0.04, 0.68, { y: 0.48 }),
    table: buildModel([
      ...tableLegs,
      bx(colors.furnitureTop, 0.98, 0.06, 0.98, { y: 0.69 }),
      bxd(colors.surface, 0.84, 0.01, 0.84, { y: 0.7155 }),
      ...corners,
    ]),
    // Editorial desk, left tile: lamp, three stamps (publish, context, reject).
    deskLeft: buildModel([
      ...deskBody,
      ...stamp(-0.3, colors.green),
      ...stamp(0, colors.orange),
      ...stamp(0.3, colors.red),
    ]),
    // Right tile: service bell, pen cup and a stack of blank folders.
    deskRight: buildModel([
      ...deskBody,
      cyl(colors.yellowDark, 0.09, 0.07, { x: 0.3, y: 0.8, z: 0.32 }),
      cyld(colors.outline, 0.02, 0.05, { x: 0.3, y: 0.86, z: 0.32 }, 6),
      cyl(colors.blue, 0.06, 0.12, { x: -0.36, y: 0.82, z: -0.28 }),
      bxd(colors.outline, 0.02, 0.1, 0.02, { x: -0.37, y: 0.92, z: -0.28, rz: 0.2 }),
      bxd(colors.red, 0.02, 0.09, 0.02, { x: -0.34, y: 0.92, z: -0.28, rz: -0.2 }),
    ]),
    // Desk lamp: slate base and arm, light shade so it reads from above.
    lamp: buildModel([
      cyl(colors.textSoft, 0.09, 0.03, { x: -0.38, y: 0.775, z: -0.36 }),
      bxd(colors.textSoft, 0.04, 0.36, 0.04, { x: -0.38, y: 0.95, z: -0.36, rz: -0.25 }),
      bxd(colors.wallTop, 0.2, 0.12, 0.2, { x: -0.3, y: 1.1, z: -0.36, rz: 0.5 }),
    ]),
  };
}

export function Fixtures({ shadows }: { shadows: boolean }) {
  const detail = useQuality((s) => s.profile.detail);
  // The merged models are rebuilt when the quality preset changes.
  return <FixtureSet key={String(detail)} detail={detail} shadows={shadows} />;
}

function FixtureSet({ detail, shadows }: { detail: boolean; shadows: boolean }) {
  const fixtures = useMemo(() => runtime.map.fixtures, []);
  const tiles = useMemo(() => {
    const firstDesks = new Set(
      fixtures.filter((f) => isFirstDeskTile(f, fixtures)).map((f) => f.id),
    );
    return {
      conveyor: tilesOf('conveyor'),
      table: tilesOf('table'),
      deskLeft: tilesOf('desk', (id) => firstDesks.has(id)),
      deskRight: tilesOf('desk', (id) => !firstDesks.has(id)),
    };
  }, [fixtures]);
  const g = useGeometries(sharedParts);
  const caps = useGeometries(() => {
    const geometry = conveyorCaps(tiles.conveyor);
    return geometry ? { caps: geometry } : {};
  }).caps;

  const belt = useMemo(createBeltTexture, []);
  const hazard = useMemo(createHazardTexture, []);
  useLayoutEffect(
    () => () => {
      belt.dispose();
      hazard.dispose();
    },
    [belt, hazard],
  );
  useFrame((_, delta) => {
    if (detail && !useSettings.getState().reducedMotion) {
      belt.offset.x = (belt.offset.x - delta * BELT_SPEED) % 1;
    }
  });

  return (
    <group>
      {fixtures.map((fixture) => (
        <group
          key={fixture.id}
          name={`fixture:${fixture.id}`}
          position={[fixture.col + 0.5, 0, fixture.row + 0.5]}
        >
          {fixture.kind === 'station' && fixture.station && (
            <StationModel kind={fixture.station} shadows={shadows} detail={detail} />
          )}
        </group>
      ))}
      <InstancedPart geometry={g.conveyorFrame} tiles={tiles.conveyor} shadows={shadows} />
      <InstancedPart geometry={g.rails} tiles={tiles.conveyor} map={hazard} shadows={shadows} />
      <InstancedPart geometry={g.belt} tiles={tiles.conveyor} map={belt} shadows={shadows} />
      {caps && (
        <mesh geometry={caps} castShadow={shadows} receiveShadow={shadows}>
          <meshLambertMaterial vertexColors />
        </mesh>
      )}
      <InstancedPart geometry={g.table} tiles={tiles.table} shadows={shadows} />
      <InstancedPart geometry={g.deskLeft} tiles={tiles.deskLeft} shadows={shadows} />
      <InstancedPart geometry={g.deskRight} tiles={tiles.deskRight} shadows={shadows} />
      {detail && <InstancedPart geometry={g.lamp} tiles={tiles.deskLeft} shadows={shadows} />}
    </group>
  );
}
