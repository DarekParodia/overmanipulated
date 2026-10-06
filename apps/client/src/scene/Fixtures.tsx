// Interactive fixtures from the tile map: conveyor belt, tables, the editorial desk and the
// verification stations. Every prop is one vertex-coloured geometry (palette tokens), so a
// station costs one draw call and repeated fixtures are a single instanced draw. Each fixture
// also gets a group named `fixture:<id>` at its tile centre for tests.

import { useFrame } from '@react-three/fiber';
import type { StationKind } from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { type BufferGeometry, type InstancedMesh, Object3D, type Texture } from 'three';
import { runtime } from '../net/session.ts';
import { palette } from '../ui/tokens.ts';
import { isFirstDeskTile } from './entities.ts';
import { box, cone, cylinder, mergePainted, ring, useGeometries } from './geometry.ts';
import { useQuality } from './quality.ts';
import { createBeltTexture } from './textures.ts';

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

/** Light table with photo slides and a loupe (surface 0.8). */
function imageSearchParts(detail: boolean): Parts {
  const legs = [-0.4, 0.4].flatMap((x) =>
    [-0.4, 0.4].map((z) => box(0.08, 0.72, 0.08, { x, y: 0.36, z })),
  );
  return [
    [palette.furniture, [...legs, box(0.9, 0.12, 0.9, { y: 0.66 })]],
    [palette.ink, [box(0.98, 0.06, 0.98, { y: 0.75 })]],
    [palette.wallTop, [box(0.84, 0.02, 0.84, { y: 0.79 })]],
    [
      palette.ink,
      [
        ring(0.085, 0.02, { x: 0.3, y: 0.83, z: 0.3, rx: Math.PI / 2 }),
        box(0.16, 0.03, 0.035, { x: 0.43, y: 0.83, z: 0.39, ry: -0.6 }),
      ],
    ],
    [
      palette.paperDeep,
      detail
        ? [
            box(0.15, 0.006, 0.12, { x: -0.33, y: 0.803, z: 0.3, ry: 0.12 }),
            box(0.15, 0.006, 0.12, { x: 0.33, y: 0.803, z: -0.31, ry: -0.08 }),
            box(0.15, 0.006, 0.12, { x: -0.31, y: 0.803, z: -0.3, ry: 0.05 }),
          ]
        : [],
    ],
  ];
}

/** Three-drawer filing cabinet with label holders (surface 1.05). */
function archiveParts(detail: boolean): Parts {
  const drawerY = [0.2, 0.52, 0.84];
  return [
    [palette.inkFaint, [box(0.84, 1.05, 0.74, { y: 0.525, z: -0.04 })]],
    [palette.paperDeep, drawerY.map((y) => box(0.74, 0.28, 0.03, { y, z: 0.34 }))],
    [palette.ink, drawerY.map((y) => box(0.22, 0.035, 0.04, { y: y - 0.04, z: 0.37 }))],
    [
      palette.paper,
      detail ? drawerY.map((y) => box(0.16, 0.07, 0.012, { y: y + 0.06, z: 0.36 })) : [],
    ],
  ];
}

/** Card index cabinet: a grid of small drawers, one pulled out showing the cards (surface 0.7). */
function sourceRegistryParts(detail: boolean): Parts {
  const fronts: BufferGeometry[] = [];
  const pulls: BufferGeometry[] = [];
  const pulledX = 0.28;
  const pulledY = 0.31;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const pulled = row === 1 && col === 2;
      const x = -0.28 + col * 0.28;
      const y = 0.13 + row * 0.18;
      const z = pulled ? 0.56 : 0.39;
      fronts.push(box(0.25, 0.15, 0.02, { x, y, z }));
      pulls.push(box(0.07, 0.025, 0.03, { x, y: y - 0.02, z: z + 0.02 }));
    }
  }
  const cards = detail
    ? Array.from({ length: 6 }, (_, i) =>
        box(0.19, 0.12 + (i % 3) * 0.015, 0.008, {
          x: pulledX,
          y: pulledY + 0.05,
          z: 0.33 + i * 0.035,
          rx: -0.15 + (i % 2) * 0.1,
        }),
      )
    : [];
  return [
    [
      palette.wood,
      [
        box(0.9, 0.62, 0.8, { y: 0.31 }),
        // Shell of the pulled-out drawer.
        box(0.23, 0.12, 0.24, { x: pulledX, y: pulledY, z: 0.43 }),
      ],
    ],
    [palette.furnitureTop, [box(0.96, 0.08, 0.86, { y: 0.66 })]],
    [palette.cork, fronts],
    [palette.ink, pulls],
    [palette.paper, cards],
  ];
}

/** Stations not used by stage 2 levels: a work table with one telling object at the back. */
function genericStationParts(kind: StationKind): Parts {
  const marker =
    kind === 'phone'
      ? [
          box(0.26, 0.08, 0.2, { x: -0.25, y: 0.8, z: -0.37 }),
          box(0.3, 0.05, 0.07, { x: -0.25, y: 0.86, z: -0.37 }),
        ]
      : kind === 'aiScanner'
        ? [box(0.5, 0.32, 0.04, { y: 0.95, z: -0.36, rx: -0.3 })]
        : [
            box(0.3, 0.07, 0.22, { x: -0.25, y: 0.8, z: -0.37 }),
            box(0.28, 0.07, 0.2, { x: -0.24, y: 0.87, z: -0.37, ry: 0.2 }),
            box(0.26, 0.07, 0.2, { x: -0.25, y: 0.94, z: -0.37, ry: -0.1 }),
          ];
  return [
    [palette.furniture, [box(0.9, 0.7, 0.9, { y: 0.35 })]],
    [palette.furnitureTop, [box(0.98, 0.06, 0.98, { y: 0.73 })]],
    [palette.ink, marker],
  ];
}

function stationParts(kind: StationKind, detail: boolean): Parts {
  switch (kind) {
    case 'imageSearch':
      return imageSearchParts(detail);
    case 'archive':
      return archiveParts(detail);
    case 'sourceRegistry':
      return sourceRegistryParts(detail);
    default:
      return genericStationParts(kind);
  }
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
    [-0.36, 0.36].map((z) => box(0.06, 0.4, 0.06, { x, y: 0.2, z })),
  );
  const tableLegs = [-0.42, 0.42].flatMap((x) =>
    [-0.42, 0.42].map((z) => box(0.07, 0.68, 0.07, { x, y: 0.34, z })),
  );
  return {
    conveyorFrame: mergePainted([
      [
        palette.inkFaint,
        [
          box(1, 0.12, 0.08, { y: 0.44, z: -0.38 }),
          box(1, 0.12, 0.08, { y: 0.44, z: 0.38 }),
          ...conveyorLegs,
          cylinder(0.05, 0.7, { y: 0.43, rx: Math.PI / 2 }, 8),
        ],
      ],
    ]),
    belt: box(1, 0.04, 0.68, { y: 0.48 }),
    // Layout table: wooden legs, paper-covered top (reads apart from decorative furniture).
    table: mergePainted([
      [palette.furniture, tableLegs],
      [palette.paperDeep, [box(0.98, 0.05, 0.98, { y: 0.695 })]],
    ]),
    desk: mergePainted([
      [palette.wood, [box(1, 0.7, 0.9, { y: 0.35 })]],
      [palette.furnitureTop, [box(1.02, 0.06, 0.98, { y: 0.73 })]],
      [palette.paper, [box(0.72, 0.01, 0.52, { y: 0.762 })]],
    ]),
    // Desk lamp: ink base and arm, light paper shade so it reads from above.
    lamp: mergePainted([
      [
        palette.ink,
        [
          cylinder(0.09, 0.03, { x: -0.36, y: 0.775, z: -0.34 }),
          box(0.03, 0.36, 0.03, { x: -0.36, y: 0.95, z: -0.34, rz: -0.25 }),
        ],
      ],
      [palette.wallTop, [cone(0.12, 0.13, { x: -0.28, y: 1.1, z: -0.34, rz: 0.5 })]],
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
  useLayoutEffect(() => () => belt.dispose(), [belt]);
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
      <InstancedPart geometry={g.belt} tiles={tiles.conveyor} map={belt} shadows={shadows} />
      <InstancedPart geometry={g.table} tiles={tiles.table} shadows={shadows} />
      <InstancedPart geometry={g.desk} tiles={tiles.desk} shadows={shadows} />
      {detail && <InstancedPart geometry={g.lamp} tiles={tiles.lamp} shadows={shadows} />}
    </group>
  );
}
