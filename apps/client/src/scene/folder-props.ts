// Per-type folder props (S3-06): a small, distinct object tucked into the back edge of every
// folder so its story type reads from the silhouette as well as from the cover icon: a photo, a
// speech bubble, a phone, a cassette, a bar chart, a rolled newspaper. Built in folder-local
// space (cover top at y = thickness/2, back edge at z = -depth/2), vertex-coloured, one merged
// geometry per type (drawn instanced, one draw call per type in play).
import type { StoryType } from '@redakcja/shared';
import type { BufferGeometry } from 'three';
import { colors } from '../ui/tokens.ts';
import { FOLDER_SIZE } from './entities.ts';
import { box, cylinder, mergePainted } from './geometry.ts';

const BACK = -FOLDER_SIZE.depth / 2;
const TOP = FOLDER_SIZE.thickness / 2;
/** Props sit over the left half, behind the type badge. */
const PX = -0.12;

function photo(): BufferGeometry {
  const at = { x: PX, z: BACK - 0.04, ry: 0.22 };
  return mergePainted([
    [colors.outline, [box(0.21, 0.012, 0.18, at)]],
    [colors.surface, [box(0.18, 0.016, 0.15, at)]],
    [colors.sky, [box(0.12, 0.02, 0.09, at)]],
  ]);
}

function quote(): BufferGeometry {
  const at = { x: PX, z: BACK - 0.06 };
  return mergePainted([
    [
      colors.outline,
      [
        cylinder(0.11, 0.012, at, 14),
        box(0.07, 0.012, 0.07, { x: PX + 0.08, z: BACK - 0.005, ry: 0.6 }),
        box(0.025, 0.026, 0.025, { x: PX - 0.045, y: 0, z: BACK - 0.08 }),
        box(0.025, 0.026, 0.025, { x: PX, y: 0, z: BACK - 0.08 }),
        box(0.025, 0.026, 0.025, { x: PX + 0.045, y: 0, z: BACK - 0.08 }),
      ],
    ],
    [colors.surface, [cylinder(0.095, 0.018, at, 14)]],
  ]);
}

function post(): BufferGeometry {
  const at = { x: PX, z: BACK - 0.05, ry: -0.3 };
  return mergePainted([
    [colors.outline, [box(0.14, 0.022, 0.22, at)]],
    [colors.blue, [box(0.105, 0.026, 0.16, at)]],
  ]);
}

function recording(): BufferGeometry {
  const z = BACK - 0.045;
  return mergePainted([
    [colors.outline, [box(0.22, 0.022, 0.14, { x: PX, z })]],
    [colors.surface, [box(0.17, 0.026, 0.075, { x: PX, z: z - 0.015 })]],
    [
      colors.outline,
      [
        cylinder(0.026, 0.032, { x: PX - 0.045, z: z - 0.015 }, 10),
        cylinder(0.026, 0.032, { x: PX + 0.045, z: z - 0.015 }, 10),
      ],
    ],
  ]);
}

function statistic(): BufferGeometry {
  const z = BACK + 0.03;
  const bars: [number, number][] = [
    [PX - 0.075, 0.08],
    [PX, 0.13],
    [PX + 0.075, 0.19],
  ];
  return mergePainted([
    [
      colors.outline,
      [
        box(0.25, 0.012, 0.07, { x: PX, y: TOP + 0.006, z }),
        ...bars.map(([x, h]) =>
          box(0.066, h + 0.014, 0.05, { x, y: TOP + h / 2 + 0.006, z: z - 0.004 }),
        ),
      ],
    ],
    [colors.blue, bars.map(([x, h]) => box(0.048, h, 0.044, { x, y: TOP + h / 2 + 0.012, z }))],
  ]);
}

function article(): BufferGeometry {
  const z = BACK - 0.03;
  const along = { rz: Math.PI / 2 };
  return mergePainted([
    [colors.surface, [cylinder(0.044, 0.36, { ...along, x: 0, y: 0, z }, 10)]],
    [
      colors.outline,
      [
        // Bands round the roll and dark ends, so the white roll keeps an outline.
        cylinder(0.049, 0.03, { ...along, x: -0.08, y: 0, z }, 10),
        cylinder(0.049, 0.03, { ...along, x: 0.08, y: 0, z }, 10),
        cylinder(0.047, 0.012, { ...along, x: -0.18, y: 0, z }, 10),
        cylinder(0.047, 0.012, { ...along, x: 0.18, y: 0, z }, 10),
      ],
    ],
  ]);
}

/** One prop geometry per story type (caller disposes them). */
export function createFolderProps(): Record<StoryType, BufferGeometry> {
  return {
    photo: photo(),
    quote: quote(),
    post: post(),
    recording: recording(),
    statistic: statistic(),
    article: article(),
  };
}
