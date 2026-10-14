// The ten verification stations as chunky toy models, each with its own silhouette that matches
// its real-world tool, readable from the top-down camera and at phone zoom:
//   imageSearch    light table with a big magnifying glass leaning on it   ("Lupa obrazu")
//   archive        filing cabinet whose drawers are film reels             ("Archiwum")
//   sourceRegistry card-index cabinet, rainbow drawers, one pulled out     ("Kartoteka źródeł")
//   phone          telephone switchboard: jacks and patch cords            ("Telefon")
//   aiScanner      slate terminal with an eye screen, gantry, scan corners ("Skaner AI")
//   dataLibrary    data shelf: rows of colourful books, LEDs               ("Biblioteka danych")
//   geolocation    map board with a big red pin, folded map over the edge ("Mapa")
//   transcript     stenotype and paper roll, hanging strip with a yellow line ("Stenogram")
//   crossCheck     rack of three newspapers, a TV with antenna and a radio  ("Inne media")
//   metadata       camera, monitor with data rows, luggage tag on a string ("Metadane")
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
    bx(colors.blueDark, 0.09, 0.26, 0.09, { x: 0.38, y: 0.17, z: 0.42, rz: 0.75 }),
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
    bx(colors.surface, 0.21, 0.11, 0.22, { x: 0.26, y: 0.36, z: 0.4 }),
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

/** Back-edge board of the four Stage 7 desks: depth, centre and where its front art sits. */
const BOARD_Z = -0.45;
const BOARD_ART_Z = BOARD_Z + 0.032;

/** Point `local` on a part centred at `at` and tilted by `rx` around x (front art on a tilt). */
function onTilt(
  at: { x: number; y: number; z: number },
  rx: number,
  local: { x?: number; y?: number; z?: number },
): { x: number; y: number; z: number; rx: number } {
  const ly = local.y ?? 0;
  const lz = local.z ?? 0;
  return {
    x: at.x + (local.x ?? 0),
    y: at.y + ly * Math.cos(rx) - lz * Math.sin(rx),
    z: at.z + ly * Math.sin(rx) + lz * Math.cos(rx),
    rx,
  };
}

/** Map board on the back edge with a big red pin, a folded map hanging over the front (0.76). */
function geolocation(detail: boolean): Item[] {
  const pin = { x: 0.16, y: 1.1 };
  const items: Item[] = [
    ...deskBody(),
    // The map board: park, river and city blocks on a white sheet.
    bx(colors.surface, 0.88, 0.5, 0.05, { y: 1.0, z: BOARD_Z }),
    bxd(colors.green, 0.26, 0.18, 0.012, { x: -0.22, y: 1.11, z: BOARD_ART_Z }),
    bxd(colors.blue, 0.8, 0.07, 0.012, { y: 0.97, z: BOARD_ART_Z + 0.004, rz: 0.22 }),
    bxd(colors.orange, 0.14, 0.1, 0.012, { x: 0.28, y: 0.86, z: BOARD_ART_Z }),
    bxd(colors.orange, 0.12, 0.09, 0.012, { x: -0.3, y: 0.85, z: BOARD_ART_Z }),
    bxd(colors.orange, 0.1, 0.12, 0.012, { x: 0.02, y: 1.16, z: BOARD_ART_Z }),
    // The push-pin: a thick red head on a short stem, sticking out of the board.
    cyld(colors.textSoft, 0.018, 0.12, { ...pin, z: BOARD_Z + 0.07, rx: Math.PI / 2 }, 6),
    cyl(colors.red, 0.1, 0.08, { ...pin, z: BOARD_Z + 0.13, rx: Math.PI / 2 }, 16),
    cyld(colors.surface, 0.035, 0.012, { x: 0.13, y: 1.13, z: BOARD_Z + 0.175, rx: Math.PI / 2 }),
    // The folded map: a flap on the desk and three panels hanging over the front.
    bxd(colors.surface, 0.5, 0.014, 0.1, { x: -0.06, y: 0.767, z: 0.39 }),
    bx(colors.surface, 0.5, 0.38, 0.03, { x: -0.06, y: 0.55, z: FRONT + 0.02 }),
    bxd(colors.surfaceSunk, 0.015, 0.38, 0.012, { x: -0.14, y: 0.55, z: FRONT + 0.04 }),
    bxd(colors.surfaceSunk, 0.015, 0.38, 0.012, { x: 0.03, y: 0.55, z: FRONT + 0.04 }),
    bxd(colors.blue, 0.5, 0.06, 0.012, { x: -0.06, y: 0.52, z: FRONT + 0.045, rz: -0.3 }),
    cyld(colors.red, 0.045, 0.012, { x: 0.08, y: 0.63, z: FRONT + 0.05, rx: Math.PI / 2 }, 12),
  ];
  if (detail) {
    // A compass on the front-right corner of the desk.
    items.push(
      cyld(colors.yellowDark, 0.08, 0.02, { x: 0.32, y: 0.77, z: 0.32 }, 16),
      cyld(colors.surface, 0.06, 0.022, { x: 0.32, y: 0.771, z: 0.32 }, 16),
      bxd(colors.red, 0.02, 0.012, 0.09, { x: 0.32, y: 0.785, z: 0.32, ry: 0.5 }),
    );
  }
  return items;
}

/** Stenotype and paper roll on the back edge, a hanging strip with one highlight (0.76). */
function transcript(detail: boolean): Item[] {
  const strip = { x: 0, y: 0.45, z: FRONT + 0.02 };
  const items: Item[] = [
    ...deskBody(),
    // The stenotype machine: a low slate block with rows of keys.
    bx(colors.textSoft, 0.58, 0.12, 0.2, { y: 0.82, z: -0.37 }),
    // The paper roll on two posts above it.
    bx(colors.surfaceSunk, 0.05, 0.36, 0.05, { x: -0.36, y: 0.94, z: -0.42 }),
    bx(colors.surfaceSunk, 0.05, 0.36, 0.05, { x: 0.36, y: 0.94, z: -0.42 }),
    cyl(colors.surface, 0.1, 0.62, { y: 1.1, z: -0.42, rz: Math.PI / 2 }, 14),
    // The strip of paper: a flap on the desk, then hanging down the front.
    bxd(colors.surface, 0.36, 0.014, 0.1, { y: 0.767, z: 0.39 }),
    bx(colors.surface, 0.36, 0.54, 0.03, strip),
  ];
  const rows = detail ? [0.12, 0.18, 0.18, 0, 0.14, 0.18] : [0.12, 0.18, 0, 0.14, 0.18];
  for (const [i, inset] of rows.entries()) {
    const y = 0.64 - i * (detail ? 0.075 : 0.09);
    if (inset === 0) {
      // The highlighted line: a yellow marker bar under a text bar.
      items.push(
        bxd(colors.yellow, 0.32, 0.085, 0.012, { y, z: FRONT + 0.04 }),
        bxd(colors.outline, 0.2, 0.03, 0.012, { y, z: FRONT + 0.045 }),
      );
    } else {
      const w = 0.26 - inset * 0.3;
      items.push(bxd(colors.outline, w, 0.03, 0.012, { x: w / 2 - 0.13, y, z: FRONT + 0.04 }));
    }
  }
  const keyRows = detail ? [-0.43, -0.37, -0.31] : [-0.41, -0.33];
  for (const z of keyRows) {
    items.push(bxd(colors.surface, 0.48, 0.02, 0.035, { y: 0.89, z }));
  }
  if (detail) {
    // The curled bottom end of the strip.
    items.push(cyld(colors.surface, 0.03, 0.36, { y: 0.17, z: FRONT + 0.05, rz: Math.PI / 2 }, 8));
  }
  return items;
}

/** Rack of three newspapers on the front, a TV and a radio on the back edge (0.76). */
function crossCheck(detail: boolean): Item[] {
  const tilt = -0.15;
  const items: Item[] = [
    ...deskBody(),
    // The rack: a low lip the papers stand in.
    bx(colors.textSoft, 0.8, 0.06, 0.05, { y: 0.2, z: FRONT + 0.06 }),
  ];
  const mastheads = [colors.blue, colors.red, colors.green] as const;
  for (const [i, masthead] of mastheads.entries()) {
    const at = { x: -0.26 + i * 0.26, y: 0.42, z: FRONT + 0.03 };
    items.push(
      bx(colors.surface, 0.22, 0.34, 0.025, { ...at, rx: tilt }),
      bxd(masthead, 0.2, 0.06, 0.01, onTilt(at, tilt, { y: 0.12, z: 0.018 })),
    );
    for (const [line, w] of (detail ? [0.16, 0.12, 0.16, 0.1] : [0.16, 0.12]).entries()) {
      items.push(
        bxd(
          colors.textFaint,
          w,
          0.022,
          0.01,
          onTilt(at, tilt, { y: 0.04 - line * 0.05, z: 0.018 }),
        ),
      );
    }
  }
  // The TV: slate box, sky screen, V antenna.
  const tv = { x: -0.2, y: 0.9, z: -0.37 };
  items.push(
    bx(colors.textSoft, 0.36, 0.28, 0.2, tv),
    bxd(colors.sky, 0.28, 0.2, 0.012, { ...tv, z: tv.z + 0.106 }),
    bx(colors.outline, 0.02, 0.22, 0.02, { x: tv.x - 0.06, y: 1.13, z: tv.z, rz: 0.45 }),
    bx(colors.outline, 0.02, 0.22, 0.02, { x: tv.x + 0.06, y: 1.13, z: tv.z, rz: -0.45 }),
  );
  // The radio: an orange box with a speaker and a handle.
  const radio = { x: 0.25, y: 0.86, z: -0.38 };
  items.push(
    bx(colors.orange, 0.3, 0.2, 0.14, radio),
    cyld(
      colors.outline,
      0.06,
      0.012,
      { x: 0.2, y: radio.y, z: radio.z + 0.076, rx: Math.PI / 2 },
      12,
    ),
    bx(colors.outline, 0.22, 0.03, 0.03, { x: radio.x, y: 1.0, z: radio.z }),
  );
  if (detail) {
    items.push(
      cyld(colors.red, 0.025, 0.04, { x: tv.x - 0.11, y: 1.23, z: tv.z }, 8),
      cyld(colors.red, 0.025, 0.04, { x: tv.x + 0.11, y: 1.23, z: tv.z }, 8),
      cyld(
        colors.surface,
        0.03,
        0.012,
        { x: 0.33, y: radio.y, z: radio.z + 0.076, rx: Math.PI / 2 },
        10,
      ),
    );
  }
  return items;
}

/** Camera and a data monitor on the back edge, a luggage tag hanging at the front (0.76). */
function metadata(detail: boolean): Item[] {
  const camera = { x: -0.23, y: 0.87, z: -0.4 };
  const screen = { x: 0.22, y: 1.05, z: -0.4 };
  const tag = { x: 0.24, y: 0.42, z: FRONT + 0.03 };
  const photo = { x: -0.17, y: 0.5 };
  const items: Item[] = [
    ...deskBody(),
    // The camera: navy body, viewfinder bump, big sky lens facing the players.
    bx(colors.outline, 0.32, 0.2, 0.16, camera),
    bx(colors.outline, 0.12, 0.06, 0.1, { x: camera.x - 0.06, y: 1.0, z: camera.z }),
    cyl(colors.sky, 0.085, 0.08, { x: camera.x, y: camera.y, z: -0.3, rx: Math.PI / 2 }, 16),
    cyld(colors.skyDeep, 0.045, 0.084, { x: camera.x, y: camera.y, z: -0.3, rx: Math.PI / 2 }, 12),
    // The monitor: slate frame on a stand, a dark screen with data rows.
    bx(colors.textSoft, 0.06, 0.16, 0.06, { x: screen.x, y: 0.84, z: screen.z }),
    bx(colors.textSoft, 0.38, 0.28, 0.05, screen),
    bxd(colors.outline, 0.32, 0.22, 0.012, { ...screen, z: screen.z + 0.027 }),
    // A photo print hanging on the front: the file the data belongs to.
    bx(colors.surface, 0.3, 0.28, 0.03, { x: photo.x, y: photo.y, z: FRONT + 0.02 }),
    bxd(colors.sky, 0.26, 0.16, 0.012, { x: photo.x, y: photo.y + 0.04, z: FRONT + 0.04 }),
    bxd(colors.green, 0.26, 0.07, 0.012, { x: photo.x, y: photo.y - 0.075, z: FRONT + 0.04 }),
    // The luggage tag on a string: body, stepped top, hole.
    bxd(colors.outline, 0.015, 0.16, 0.015, { x: tag.x, y: tag.y + 0.22, z: tag.z }),
    bx(colors.yellowDark, 0.2, 0.22, 0.03, tag),
    bx(colors.yellowDark, 0.12, 0.07, 0.03, { ...tag, y: tag.y + 0.14 }),
    cyld(colors.outline, 0.025, 0.012, {
      x: tag.x,
      y: tag.y + 0.14,
      z: tag.z + 0.02,
      rx: Math.PI / 2,
    }),
  ];
  const rows = detail ? [0.24, 0.16, 0.2, 0.12, 0.18] : [0.24, 0.16, 0.2];
  for (const [i, w] of rows.entries()) {
    items.push(
      bxd(i % 2 === 0 ? colors.green : colors.blue, w, 0.03, 0.01, {
        x: screen.x - 0.13 + w / 2,
        y: screen.y + 0.08 - i * (detail ? 0.04 : 0.06),
        z: screen.z + 0.035,
      }),
    );
  }
  if (detail) {
    items.push(
      bxd(colors.surface, 0.06, 0.03, 0.02, { x: camera.x + 0.09, y: 0.94, z: camera.z + 0.07 }),
      bxd(colors.outline, 0.13, 0.025, 0.01, { x: tag.x, y: tag.y + 0.02, z: tag.z + 0.02 }),
      bxd(colors.outline, 0.09, 0.025, 0.01, { x: tag.x, y: tag.y - 0.04, z: tag.z + 0.02 }),
      cyld(colors.yellow, 0.03, 0.012, {
        x: photo.x + 0.08,
        y: photo.y + 0.08,
        z: FRONT + 0.045,
        rx: Math.PI / 2,
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
  geolocation,
  transcript,
  crossCheck,
  metadata,
};

/** The merged, outlined model of one station kind (one draw call). */
export function stationGeometry(kind: StationKind, detail: boolean): BufferGeometry {
  return buildModel([...plinth(), ...BUILDERS[kind](detail)]);
}
