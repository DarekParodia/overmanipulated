// The six verification stations as chunky toy models, each with its own silhouette that matches
// its real-world tool, readable from the top-down camera and at phone zoom:
//   imageSearch    light table with a big magnifying glass leaning on it   ("Lupa obrazu")
//   archive        filing cabinet whose drawers are film reels             ("Archiwum")
//   sourceRegistry card-index cabinet, rainbow drawers, one pulled out     ("Kartoteka źródeł")
//   phone          telephone switchboard: jacks and patch cords            ("Telefon")
//   aiScanner      slate terminal with an eye screen, gantry, scan corners ("Skaner AI")
//   dataLibrary    data shelf: rows of colourful books, LEDs               ("Biblioteka danych")
// The station sign (StationIndicators) floats over the top of each model, so the identifying
// art lives on the FRONT faces, below the sign, and tall parts are kept few and wide. Bodies are
// pale grey-blue on a blue plinth so stations stand out from the orange-brown decoration. Each
// model's working surface stays at `SURFACE_HEIGHT[kind]` (folders rest there) and the middle of
// the top (a 0.6 × 0.45 folder plus its prop) is kept clear.
import type { StationKind } from '@redakcja/shared';
import type { BufferGeometry } from 'three';
import { colors } from '../ui/tokens.ts';
import { buildModel, bx, bxd, cyl, cyld, type Item, tor } from './models.ts';

const PLINTH_TOP = 0.09;
/** Front face of a standard 0.84 body, and where front art sits just in front of it. */
const FRONT = 0.43;

const CARD_COLORS = [
  colors.blue,
  colors.orange,
  colors.green,
  colors.red,
  colors.purple,
  colors.blue,
  colors.orange,
] as const;

const BOOK_COLORS = [
  colors.blue,
  colors.orange,
  colors.red,
  colors.green,
  colors.purple,
  colors.yellowDark,
  colors.blueDark,
] as const;

function plinth(): Item[] {
  return [bx(colors.blue, 0.94, PLINTH_TOP, 0.94, { y: PLINTH_TOP / 2 })];
}

/** Four chunky legs for a work table whose slab sits between `PLINTH_TOP` and `top`. */
function legs(span: number, top: number): Item[] {
  const h = top - PLINTH_TOP;
  return [-span, span].flatMap((x) =>
    [-span, span].map((z) => bx(colors.surfaceSunk, 0.1, h, 0.1, { x, y: PLINTH_TOP + h / 2, z })),
  );
}

/** Standard desk-height body (surface 0.76) used by the four "desk" stations. */
function deskBody(): Item[] {
  return [
    bx(colors.surfaceSunk, 0.84, 0.6, 0.84, { y: 0.39 }),
    bx(colors.surfaceSoft, 0.9, 0.07, 0.9, { y: 0.725 }),
  ];
}

/** Light table with photo slides and a big magnifying glass leaning on its front (0.8). */
function imageSearch(detail: boolean): Item[] {
  const tilt = -0.2;
  const lens = { x: 0.2, y: 0.4, z: 0.42 };
  const items: Item[] = [
    ...legs(0.34, 0.66),
    bx(colors.surfaceSunk, 0.84, 0.12, 0.84, { y: 0.66 }),
    bx(colors.wallTop, 0.78, 0.06, 0.78, { y: 0.75 }),
    bxd(colors.surface, 0.7, 0.02, 0.7, { y: 0.79 }),
    // The lens: blue frame, pale glass, a stubby handle, standing on the plinth.
    tor(colors.blueDark, 0.22, 0.055, { ...lens, rx: tilt }),
    cyld(colors.sky, 0.21, 0.03, { ...lens, rx: Math.PI / 2 + tilt }, 16),
    bx(colors.blueDark, 0.09, 0.3, 0.09, { x: 0.43, y: 0.16, z: 0.42, rz: 0.75 }),
  ];
  if (detail) {
    items.push(
      bxd(colors.surface, 0.17, 0.014, 0.13, { x: -0.27, y: 0.805, z: 0.26, ry: 0.12 }),
      bxd(colors.surface, 0.17, 0.014, 0.13, { x: 0.25, y: 0.805, z: -0.27, ry: -0.08 }),
      bxd(colors.blue, 0.1, 0.016, 0.07, { x: -0.27, y: 0.808, z: 0.26, ry: 0.12 }),
    );
  }
  return items;
}

/** Filing cabinet whose upper drawers are film reels: the timeline (surface 1.05). */
function archive(detail: boolean): Item[] {
  const reel = (x: number): Item[] => {
    const at = { x, y: 0.72, z: 0.4, rx: Math.PI / 2 };
    return [
      cyl(colors.orange, 0.17, 0.06, at, 16),
      cyld(colors.surface, 0.06, 0.09, at, 10),
      ...(detail
        ? [0, 1, 2, 3].map((i) =>
            cyld(
              colors.outline,
              0.03,
              0.08,
              {
                x: x + Math.cos((i * Math.PI) / 2 + 0.78) * 0.1,
                y: 0.72 + Math.sin((i * Math.PI) / 2 + 0.78) * 0.1,
                z: 0.4,
                rx: Math.PI / 2,
              },
              6,
            ),
          )
        : []),
    ];
  };
  const items: Item[] = [
    bx(colors.surfaceSunk, 0.82, 0.9, 0.72, { y: 0.54, z: -0.04 }),
    bx(colors.surfaceSoft, 0.88, 0.07, 0.78, { y: 1.015, z: -0.04 }),
    ...reel(-0.2),
    ...reel(0.2),
    // Film strip between the reels, and a bottom drawer with a label.
    bxd(colors.outline, 0.42, 0.03, 0.03, { y: 0.55, z: 0.4 }),
    bxd(colors.orange, 0.7, 0.2, 0.03, { y: 0.27, z: 0.325 }),
    bxd(colors.outline, 0.26, 0.05, 0.05, { y: 0.25, z: 0.35 }),
    bxd(colors.surface, 0.18, 0.07, 0.012, { y: 0.32, z: 0.345 }),
  ];
  // Index tabs along the top edge: the timeline's years.
  for (let i = 0; i < 4; i++) {
    items.push(
      bxd(CARD_COLORS[i] ?? colors.blue, 0.1, 0.06, 0.03, {
        x: -0.28 + i * 0.19,
        y: 0.93,
        z: 0.325,
      }),
    );
  }
  return items;
}

/** Card-index cabinet: rainbow drawer fronts, one pulled out with fanned cards (surface 0.7). */
function sourceRegistry(detail: boolean): Item[] {
  const items: Item[] = [
    bx(colors.surfaceSunk, 0.84, 0.5, 0.74, { y: 0.34 }),
    bx(colors.surfaceSoft, 0.9, 0.1, 0.8, { y: 0.65 }),
    // The pulled-out drawer: shell and fanned index cards.
    bx(colors.surface, 0.21, 0.11, 0.22, { x: 0.26, y: 0.36, z: 0.42 }),
  ];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const pulled = row === 1 && col === 2;
      const x = -0.26 + col * 0.26;
      const y = 0.19 + row * 0.15;
      const z = pulled ? 0.5 : 0.385;
      const color = CARD_COLORS[(row * 3 + col) % CARD_COLORS.length] ?? colors.blue;
      items.push(bx(color, 0.23, 0.12, 0.03, { x, y, z }));
      items.push(bxd(colors.surface, 0.1, 0.03, 0.03, { x, y: y + 0.0, z: z + 0.025 }));
    }
  }
  if (detail) {
    for (let i = 0; i < 5; i++) {
      items.push(
        bxd(colors.surface, 0.17, 0.12 + (i % 3) * 0.015, 0.008, {
          x: 0.26,
          y: 0.44,
          z: 0.35 + i * 0.03,
          rx: -0.15 + (i % 2) * 0.1,
        }),
      );
    }
  }
  return items;
}

/** Switchboard: front covered in jacks with red, orange and green patch cords hanging (0.76). */
function phone(detail: boolean): Item[] {
  const items: Item[] = [
    ...deskBody(),
    bx(colors.textSoft, 0.8, 0.52, 0.04, { y: 0.4, z: FRONT + 0.02 }),
  ];
  const cols = [-0.27, -0.09, 0.09, 0.27];
  const rows = detail ? [0.58, 0.44, 0.3, 0.16] : [0.55, 0.38, 0.21];
  for (const [r, y] of rows.entries()) {
    for (const [c, x] of cols.entries()) {
      items.push(
        cyld((r + c) % 3 === 0 ? colors.yellowDark : colors.surface, 0.04, 0.03, {
          x,
          y,
          z: FRONT + 0.05,
          rx: Math.PI / 2,
        }),
      );
    }
  }
  const cords: [number, number, string][] = [
    [-0.27, 0.58, colors.red],
    [0.09, 0.44, colors.orange],
    [0.27, 0.58, colors.green],
  ];
  for (const [x, y, color] of cords) {
    items.push(
      cyld(color, 0.045, 0.06, { x, y, z: FRONT + 0.07, rx: Math.PI / 2 }, 8),
      bxd(color, 0.035, y - 0.1, 0.03, { x, y: 0.1 + (y - 0.1) / 2, z: FRONT + 0.09 }),
    );
  }
  // Handset on the desk, front right, and a headset arch at the back edge.
  items.push(
    bx(colors.red, 0.26, 0.06, 0.07, { x: 0.3, y: 0.8, z: 0.36 }),
    bx(colors.red, 0.09, 0.09, 0.11, { x: 0.18, y: 0.81, z: 0.36 }),
    bx(colors.red, 0.09, 0.09, 0.11, { x: 0.42, y: 0.81, z: 0.36 }),
    bx(colors.textSoft, 0.7, 0.2, 0.05, { y: 0.9, z: -0.45 }),
  );
  return items;
}

/** Slate terminal with a big eye screen on the front, a purple gantry and scan corners (0.76). */
function aiScanner(detail: boolean): Item[] {
  const items: Item[] = [
    bx(colors.textSoft, 0.84, 0.6, 0.84, { y: 0.39 }),
    bx(colors.surfaceSunk, 0.9, 0.07, 0.9, { y: 0.725 }),
    // Eye screen on the front.
    bx(colors.outline, 0.64, 0.36, 0.04, { y: 0.4, z: FRONT + 0.02 }),
    bxd(colors.purple, 0.56, 0.28, 0.02, { y: 0.4, z: FRONT + 0.05 }),
    cyld(colors.surface, 0.11, 0.02, { x: 0, y: 0.4, z: FRONT + 0.07, rx: Math.PI / 2 }, 14),
    cyld(colors.outline, 0.055, 0.03, { x: 0, y: 0.4, z: FRONT + 0.08, rx: Math.PI / 2 }, 10),
    // Gantry: two posts and a beam on the back edge, leaving the middle of the table free.
    bx(colors.purple, 0.08, 0.5, 0.08, { x: -0.4, y: 1.0, z: -0.4 }),
    bx(colors.purple, 0.08, 0.5, 0.08, { x: 0.4, y: 1.0, z: -0.4 }),
    bx(colors.purple, 0.9, 0.13, 0.12, { y: 1.26, z: -0.4 }),
  ];
  // Scan-plate brackets: four purple corners marking where the folder is read.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      items.push(
        bxd(colors.purple, 0.14, 0.014, 0.03, { x: sx * 0.31, y: 0.77, z: sz * 0.2 }),
        bxd(colors.purple, 0.03, 0.014, 0.14, { x: sx * 0.37, y: 0.77, z: sz * 0.2 - sz * 0.055 }),
      );
    }
  }
  if (detail) {
    items.push(
      bxd(colors.green, 0.05, 0.03, 0.02, { x: -0.18, y: 1.27, z: -0.33 }),
      bxd(colors.red, 0.05, 0.03, 0.02, { x: 0.0, y: 1.27, z: -0.33 }),
      bxd(colors.yellowDark, 0.05, 0.03, 0.02, { x: 0.18, y: 1.27, z: -0.33 }),
    );
  }
  return items;
}

/** Bookcase front with two rows of colourful book spines, plus LEDs on top (surface 0.76). */
function dataLibrary(detail: boolean): Item[] {
  const items: Item[] = [
    ...deskBody(),
    // Open shelves on the front: dark recess, a middle board, rows of books.
    bxd(colors.outline, 0.74, 0.54, 0.03, { y: 0.4, z: FRONT + 0.01 }),
    bx(colors.surfaceSoft, 0.78, 0.04, 0.06, { y: 0.4, z: FRONT + 0.03 }),
  ];
  const perRow = detail ? 9 : 6;
  for (const [row, base] of [0.14, 0.43].entries()) {
    for (let i = 0; i < perRow; i++) {
      const h = 0.18 + ((i * 7 + row * 3) % 4) * 0.025;
      const x = ((i - (perRow - 1) / 2) * 0.62) / (perRow - 1);
      items.push(
        bxd(BOOK_COLORS[(i + row * 3) % BOOK_COLORS.length] ?? colors.blue, 0.06, h, 0.05, {
          x,
          y: base + h / 2,
          z: FRONT + 0.05,
        }),
      );
    }
  }
  // Tall back board with LED lights: the "data" part, wide so it reads beside the sign.
  items.push(
    bx(colors.surfaceSunk, 0.88, 0.4, 0.06, { y: 1.0, z: -0.45 }),
    bx(colors.outline, 0.7, 0.14, 0.04, { y: 1.03, z: -0.41 }),
  );
  for (let i = 0; i < 5; i++) {
    items.push(
      bxd(i % 2 === 0 ? colors.green : colors.blue, 0.07, 0.07, 0.03, {
        x: -0.28 + i * 0.14,
        y: 1.03,
        z: -0.385,
      }),
    );
  }
  return items;
}

const BUILDERS: Record<StationKind, (detail: boolean) => Item[]> = {
  imageSearch,
  archive,
  sourceRegistry,
  phone,
  aiScanner,
  dataLibrary,
};

/** The merged, outlined model of one station kind (one draw call). */
export function stationGeometry(kind: StationKind, detail: boolean): BufferGeometry {
  return buildModel([...plinth(), ...BUILDERS[kind](detail)]);
}
