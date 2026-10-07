// Interactive fixtures from the tile map: conveyor belt, tables, the editorial desk and the
// verification stations, made to pop from the decoration (design-rules §7): stations stand on a
// white plinth with a navy rim, the conveyor has yellow/navy hazard rails, the desk carries a
// green and a red stamp pad. Every prop is one vertex-coloured geometry (palette tokens), so a
// station costs one draw call and repeated fixtures are a single instanced draw. Each fixture
// also gets a group named `fixture:<id>` at its tile centre for tests.

import { useFrame } from '@react-three/fiber';
import type { StationKind } from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type BufferGeometry, type InstancedMesh, Object3D, type Texture } from 'three';
import { runtime } from '../net/session.ts';
import { colors } from '../ui/tokens.ts';
import { isFirstDeskTile } from './entities.ts';
import { box, cone, cylinder, merge, mergePainted, ring, useGeometries } from './geometry.ts';
import { useQuality } from './quality.ts';
import { createBeltTexture, createHazardTexture } from './textures.ts';

/** Belt speed in tiles per second (texture scroll; purely cosmetic). */
const BELT_SPEED = 0.35;

type Tile = { x: number; z: number };
type Parts = [string, BufferGeometry[]][];

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

/** White plinth with a navy rim under every station: marks it as something to use. */
function plinthParts(): Parts {
  return [
    [colors.outline, [box(1.02, 0.07, 1.02, { y: 0.035 })]],
    [colors.surface, [box(0.92, 0.09, 0.92, { y: 0.045 })]],
  ];
}

/** Light table with photo slides and a loupe (surface 0.8). */
function imageSearchParts(detail: boolean): Parts {
  const legs = [-0.36, 0.36].flatMap((x) =>
    [-0.36, 0.36].map((z) => box(0.09, 0.62, 0.09, { x, y: 0.4, z })),
  );
  return [
    [colors.furniture, [...legs, box(0.84, 0.12, 0.84, { y: 0.66 })]],
    [colors.outline, [box(0.92, 0.06, 0.92, { y: 0.75 })]],
    [colors.wallTop, [box(0.78, 0.02, 0.78, { y: 0.79 })]],
    [
      colors.outline,
      [
        ring(0.1, 0.028, { x: 0.27, y: 0.83, z: 0.27, rx: Math.PI / 2 }),
        box(0.18, 0.04, 0.05, { x: 0.41, y: 0.83, z: 0.37, ry: -0.75 }),
      ],
    ],
    [
      colors.surface,
      detail
        ? [
            box(0.17, 0.006, 0.13, { x: -0.27, y: 0.803, z: 0.26, ry: 0.12 }),
            box(0.17, 0.006, 0.13, { x: 0.25, y: 0.803, z: -0.26, ry: -0.08 }),
            box(0.17, 0.006, 0.13, { x: -0.25, y: 0.803, z: -0.25, ry: 0.05 }),
          ]
        : [],
    ],
  ];
}

/** Three-drawer filing cabinet with label holders (surface 1.05). */
function archiveParts(detail: boolean): Parts {
  const drawerY = [0.28, 0.56, 0.84];
  return [
    [colors.furniture, [box(0.8, 0.98, 0.72, { y: 0.56, z: -0.04 })]],
    [colors.furnitureTop, [box(0.84, 0.05, 0.76, { y: 1.025, z: -0.04 })]],
    [colors.surfaceSunk, drawerY.map((y) => box(0.7, 0.23, 0.03, { y, z: 0.33 }))],
    [colors.outline, drawerY.map((y) => box(0.26, 0.05, 0.05, { y: y - 0.04, z: 0.36 }))],
    [
      colors.surface,
      detail ? drawerY.map((y) => box(0.18, 0.07, 0.012, { y: y + 0.06, z: 0.352 })) : [],
    ],
  ];
}

/** Card index cabinet: a grid of small drawers, one pulled out showing the cards (surface 0.7). */
function sourceRegistryParts(detail: boolean): Parts {
  const fronts: BufferGeometry[] = [];
  const pulls: BufferGeometry[] = [];
  const pulledX = 0.26;
  const pulledY = 0.36;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const pulled = row === 1 && col === 2;
      const x = -0.26 + col * 0.26;
      const y = 0.2 + row * 0.16;
      const z = pulled ? 0.52 : 0.37;
      fronts.push(box(0.23, 0.13, 0.02, { x, y, z }));
      pulls.push(box(0.08, 0.03, 0.03, { x, y: y - 0.02, z: z + 0.02 }));
    }
  }
  const cards = detail
    ? Array.from({ length: 6 }, (_, i) =>
        box(0.17, 0.11 + (i % 3) * 0.015, 0.008, {
          x: pulledX,
          y: pulledY + 0.05,
          z: 0.32 + i * 0.033,
          rx: -0.15 + (i % 2) * 0.1,
        }),
      )
    : [];
  return [
    [
      colors.furniture,
      [
        box(0.84, 0.56, 0.74, { y: 0.37 }),
        // Shell of the pulled-out drawer.
        box(0.21, 0.11, 0.22, { x: pulledX, y: pulledY, z: 0.41 }),
      ],
    ],
    [colors.furnitureTop, [box(0.9, 0.08, 0.8, { y: 0.66 })]],
    [colors.surface, [...fronts, ...cards]],
    [colors.outline, pulls],
  ];
}

/** Stations not used by stage 2 levels: a work table with one telling object at the back. */
function genericStationParts(kind: StationKind): Parts {
  const marker =
    kind === 'phone'
      ? [
          box(0.26, 0.08, 0.2, { x: -0.22, y: 0.8, z: -0.3 }),
          box(0.3, 0.05, 0.07, { x: -0.22, y: 0.86, z: -0.3 }),
        ]
      : kind === 'aiScanner'
        ? [box(0.5, 0.32, 0.04, { y: 0.95, z: -0.3, rx: -0.3 })]
        : [
            box(0.3, 0.07, 0.22, { x: -0.22, y: 0.8, z: -0.3 }),
            box(0.28, 0.07, 0.2, { x: -0.21, y: 0.87, z: -0.3, ry: 0.2 }),
            box(0.26, 0.07, 0.2, { x: -0.22, y: 0.94, z: -0.3, ry: -0.1 }),
          ];
  return [
    [colors.furniture, [box(0.84, 0.64, 0.84, { y: 0.39 })]],
    [colors.furnitureTop, [box(0.9, 0.06, 0.9, { y: 0.73 })]],
    [colors.outline, marker],
  ];
}

function stationParts(kind: StationKind, detail: boolean): Parts {
  const parts =
    kind === 'imageSearch'
      ? imageSearchParts(detail)
      : kind === 'archive'
        ? archiveParts(detail)
        : kind === 'sourceRegistry'
          ? sourceRegistryParts(detail)
          : genericStationParts(kind);
  return [...plinthParts(), ...parts];
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
  const g = useGeometries(() => ({ model: mergePainted(stationParts(kind, detail)) }));
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

function sharedParts() {
  const conveyorLegs = [-0.3, 0.3].flatMap((x) =>
    [-0.34, 0.34].map((z) => box(0.08, 0.4, 0.08, { x, y: 0.2, z })),
  );
  const tableLegs = [-0.4, 0.4].flatMap((x) =>
    [-0.4, 0.4].map((z) => box(0.08, 0.68, 0.08, { x, y: 0.34, z })),
  );
  return {
    conveyorFrame: mergePainted([
      [colors.outline, [...conveyorLegs, cylinder(0.06, 0.66, { y: 0.42, rx: Math.PI / 2 }, 8)]],
    ]),
    // Yellow/navy hazard rails on both long edges (textured: one instanced draw).
    rails: merge([
      box(1, 0.14, 0.1, { y: 0.44, z: -0.39 }),
      box(1, 0.14, 0.1, { y: 0.44, z: 0.39 }),
    ]),
    belt: box(1, 0.04, 0.68, { y: 0.48 }),
    // Layout table: wooden legs and top with a white sheet, quieter than the stations.
    table: mergePainted([
      [colors.furniture, [...tableLegs, box(0.96, 0.05, 0.96, { y: 0.685 })]],
      [colors.surfaceSoft, [box(0.8, 0.02, 0.8, { y: 0.715 })]],
    ]),
    // Editorial desk: wood, a white blotter and two stamp pads (publish green, reject red).
    desk: mergePainted([
      [colors.furniture, [box(1, 0.7, 0.9, { y: 0.35 })]],
      [colors.furnitureTop, [box(1.02, 0.06, 0.98, { y: 0.73 })]],
      [colors.outline, [box(0.76, 0.012, 0.56, { y: 0.762 })]],
      [colors.surface, [box(0.7, 0.016, 0.5, { y: 0.765 })]],
      [colors.green, [box(0.13, 0.04, 0.1, { x: 0.38, y: 0.78, z: 0.36 })]],
      [colors.red, [box(0.13, 0.04, 0.1, { x: 0.38, y: 0.78, z: -0.36 })]],
    ]),
    // Desk lamp: navy base and arm, light shade so it reads from above.
    lamp: mergePainted([
      [
        colors.outline,
        [
          cylinder(0.09, 0.03, { x: -0.38, y: 0.775, z: -0.36 }),
          box(0.04, 0.36, 0.04, { x: -0.38, y: 0.95, z: -0.36, rz: -0.25 }),
        ],
      ],
      [colors.wallTop, [cone(0.12, 0.13, { x: -0.3, y: 1.1, z: -0.36, rz: 0.5 })]],
    ]),
  };
}

export function Fixtures({ shadows }: { shadows: boolean }) {
  const detail = useQuality((s) => s.profile.detail);
  const fixtures = useMemo(() => runtime.map.fixtures, []);
  const tiles = useMemo(() => {
    const firstDesks = new Set(
      fixtures.filter((f) => isFirstDeskTile(f, fixtures)).map((f) => f.id),
    );
    return {
      conveyor: tilesOf('conveyor'),
      table: tilesOf('table'),
      desk: tilesOf('desk'),
      lamp: tilesOf('desk', (id) => firstDesks.has(id)),
    };
  }, [fixtures]);
  const g = useGeometries(sharedParts);

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
    if (detail) {
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
            // Keyed by detail: the merged model is rebuilt when the quality preset changes.
            <StationModel
              key={String(detail)}
              kind={fixture.station}
              shadows={shadows}
              detail={detail}
            />
          )}
        </group>
      ))}
      <InstancedPart geometry={g.conveyorFrame} tiles={tiles.conveyor} shadows={shadows} />
      <InstancedPart geometry={g.rails} tiles={tiles.conveyor} map={hazard} shadows={shadows} />
      <InstancedPart geometry={g.belt} tiles={tiles.conveyor} map={belt} shadows={shadows} />
      <InstancedPart geometry={g.table} tiles={tiles.table} shadows={shadows} />
      <InstancedPart geometry={g.desk} tiles={tiles.desk} shadows={shadows} />
      {detail && <InstancedPart geometry={g.lamp} tiles={tiles.lamp} shadows={shadows} />}
    </group>
  );
}
