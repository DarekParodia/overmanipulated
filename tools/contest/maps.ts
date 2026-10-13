// Labelled newsroom maps (S6-03 deliverable 2): a top-down plan of every level drawn from the
// level's layout data, with Polish station names, the conveyor, the editorial desk, tables,
// spawn points and a legend. Output: docs/contest/maps/<level>.svg and .png.

import { playerColors } from '../../apps/client/src/ui/tokens.ts';
import { parseLayout, type StationKind } from '../../packages/shared/src/index.ts';
import {
  colors,
  copyFonts,
  esc,
  fontCss,
  ICON_FOR_STATION,
  iconSvg,
  LEVELS,
  launchBrowser,
  levelNumber,
  outPath,
  pl,
  renderPng,
  STATION_PURPOSE,
  writeOut,
} from './lib/common.ts';

const T = 52; // tile size in the SVG
const MARGIN = 28;
const HEADER = 96;
const LEGEND_W = 330;

type Level = (typeof LEVELS)[number];

/** Ink colours of the station markers; stations are told apart by icon and name, not colour. */
const STATION_FILL = colors.surfaceSoft;

function stationLabel(kind: StationKind): string {
  return pl.vocab.stations[kind];
}

function wrapIcon(svg: string, x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">${svg.replace('<svg ', '<svg x="0" y="0" ')}</g>`;
}

function pill(cx: number, cy: number, text: string, size = 14): string {
  const w = Math.max(60, text.length * size * 0.58 + 20);
  return (
    `<rect x="${cx - w / 2}" y="${cy - 13}" width="${w}" height="26" rx="13" fill="${colors.surface}" stroke="${colors.outline}" stroke-width="3"/>` +
    `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="'Baloo 2',sans-serif" font-weight="700" font-size="${size}" fill="${colors.outline}">${esc(text)}</text>`
  );
}

function tileRect(col: number, row: number, fill: string, extra = ''): string {
  const x = MARGIN + col * T;
  const y = HEADER + row * T;
  return `<rect x="${x + 3}" y="${y + 3}" width="${T - 6}" height="${T - 6}" rx="9" fill="${fill}" stroke="${colors.outline}" stroke-width="3.5" ${extra}/>`;
}

export function mapSvg(level: Level): string {
  const map = parseLayout(level.layout);
  const mapW = map.width * T;
  const mapH = map.height * T;
  const width = MARGIN * 2 + mapW + LEGEND_W + 24;
  const used = level.stations as readonly StationKind[];
  const legendRows = 7 + used.length;
  const height = Math.max(HEADER + mapH + MARGIN + 36, HEADER + 56 + legendRows * 58 + MARGIN);
  const number = levelNumber(level.id);
  const minutes = `${Math.floor(level.durationS / 60)}:${String(level.durationS % 60).padStart(2, '0')}`;
  const parts: string[] = [];

  // Floor and walls.
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const tile = map.tiles[row * map.width + col];
      const x = MARGIN + col * T;
      const y = HEADER + row * T;
      if (tile === 'wall') {
        parts.push(`<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${colors.wall}"/>`);
      } else {
        parts.push(
          `<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="${(row + col) % 2 === 0 ? colors.floor : colors.floorDark}"/>`,
        );
      }
    }
  }
  // Room outline.
  parts.push(
    `<rect x="${MARGIN}" y="${HEADER}" width="${mapW}" height="${mapH}" fill="none" stroke="${colors.outline}" stroke-width="6" rx="6"/>`,
  );

  // Plain furniture tiles ("=").
  const fixtureAt = new Set(map.fixtures.map((f) => `${f.col},${f.row}`));
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (map.tiles[row * map.width + col] === 'furniture' && !fixtureAt.has(`${col},${row}`)) {
        parts.push(tileRect(col, row, colors.furnitureTop));
      }
    }
  }

  // Merge horizontal runs of conveyor and desk tiles into one labelled block.
  const labels: string[] = [];
  const drawn = new Set<string>();
  for (const fixture of map.fixtures) {
    const key = `${fixture.col},${fixture.row}`;
    if (drawn.has(key)) {
      continue;
    }
    if (fixture.kind === 'conveyor' || fixture.kind === 'desk') {
      let run = 1;
      while (
        map.fixtures.some(
          (f) => f.kind === fixture.kind && f.row === fixture.row && f.col === fixture.col + run,
        )
      ) {
        run++;
      }
      for (let i = 0; i < run; i++) {
        drawn.add(`${fixture.col + i},${fixture.row}`);
      }
      const x = MARGIN + fixture.col * T;
      const y = HEADER + fixture.row * T;
      const w = run * T;
      if (fixture.kind === 'conveyor') {
        parts.push(
          `<rect x="${x + 3}" y="${y + 5}" width="${w - 6}" height="${T - 10}" rx="10" fill="${colors.surfaceSunk}" stroke="${colors.outline}" stroke-width="3.5"/>`,
        );
        for (let i = 0; i < run * 2; i++) {
          const cx = x + 14 + i * (T / 2);
          parts.push(
            `<path d="M${cx} ${y + 14}l9 ${T / 2 - 14}l-9 ${T / 2 - 14}" fill="none" stroke="${colors.yellowDark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
          );
        }
        labels.push(
          pill(x + w / 2, y + T + 18, `${pl.vocab.signs.conveyor}: taśma z teczkami`, 14),
        );
      } else {
        parts.push(
          `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${T - 6}" rx="10" fill="${colors.yellow}" stroke="${colors.outline}" stroke-width="3.5"/>`,
          wrapIcon(iconSvg('desk', 30, colors.outline, colors.surface), x + w / 2 - 15, y + 11),
        );
        labels.push(
          pill(x + w / 2, y - 18 < HEADER ? y + T + 18 : y - 16, 'Stół redakcyjny: werdykt', 14),
        );
      }
      continue;
    }
    drawn.add(key);
    const x = MARGIN + fixture.col * T;
    const y = HEADER + fixture.row * T;
    if (fixture.kind === 'table') {
      parts.push(
        tileRect(fixture.col, fixture.row, colors.surface),
        wrapIcon(iconSvg('folder', 28, colors.outline, colors.folder), x + 12, y + 12),
      );
    } else if (fixture.station) {
      parts.push(
        `<rect x="${x + 2}" y="${y + 2}" width="${T - 4}" height="${T - 4}" rx="11" fill="${STATION_FILL}" stroke="${colors.blue}" stroke-width="5"/>`,
        `<rect x="${x + 2}" y="${y + 2}" width="${T - 4}" height="${T - 4}" rx="11" fill="none" stroke="${colors.outline}" stroke-width="2"/>`,
        wrapIcon(
          iconSvg(ICON_FOR_STATION[fixture.station], 32, colors.outline, colors.yellow),
          x + 10,
          y + 10,
        ),
      );
      labels.push(pill(x + T / 2, y + T + 18, stationLabel(fixture.station), 14));
    }
  }

  // Spawn points.
  map.spawns.forEach((spawn, slot) => {
    const cx = MARGIN + spawn.x * T;
    const cy = HEADER + spawn.y * T;
    const fill = playerColors[slot % playerColors.length] ?? colors.orange;
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="19" fill="${fill}" stroke="${colors.outline}" stroke-width="4"/>`,
      `<text x="${cx}" y="${cy + 7}" text-anchor="middle" font-family="'Baloo 2',sans-serif" font-weight="800" font-size="21" fill="${colors.outline}">${slot + 1}</text>`,
    );
  });

  // Legend.
  const lx = MARGIN * 2 + mapW;
  let ly = HEADER;
  const legend: string[] = [
    `<rect x="${lx}" y="${ly}" width="${LEGEND_W}" height="${height - ly - MARGIN}" rx="16" fill="${colors.surface}" stroke="${colors.outline}" stroke-width="4"/>`,
    `<text x="${lx + 20}" y="${ly + 36}" font-family="'Baloo 2',sans-serif" font-weight="800" font-size="22" fill="${colors.outline}">Legenda</text>`,
  ];
  ly += 56;
  const row = (icon: string, title: string, note: string) => {
    legend.push(
      icon,
      `<text x="${lx + 70}" y="${ly + 17}" font-family="'Baloo 2',sans-serif" font-weight="700" font-size="16" fill="${colors.outline}">${esc(title)}</text>`,
      `<text x="${lx + 70}" y="${ly + 37}" font-family="Nunito,sans-serif" font-weight="600" font-size="13" fill="${colors.textSoft}">${esc(note)}</text>`,
    );
    ly += 58;
  };
  const swatch = (fill: string) =>
    `<rect x="${lx + 20}" y="${ly + 2}" width="36" height="36" rx="9" fill="${fill}" stroke="${colors.outline}" stroke-width="3.5"/>`;
  row(
    `${swatch(colors.surfaceSunk)}<path d="M${lx + 30} ${ly + 12}l8 8l-8 8M${lx + 42} ${ly + 12}l8 8l-8 8" fill="none" stroke="${colors.yellowDark}" stroke-width="3.5" stroke-linecap="round"/>`,
    'Wejście (taśma)',
    'Tu wpadają nowe teczki.',
  );
  row(
    `${swatch(colors.yellow)}${wrapIcon(iconSvg('desk', 24, colors.outline, colors.surface), lx + 26, ly + 8)}`,
    'Stół redakcyjny',
    'Tu wydajesz werdykt.',
  );
  row(
    `${swatch(colors.surface)}${wrapIcon(iconSvg('folder', 22, colors.outline, colors.folder), lx + 27, ly + 9)}`,
    'Stolik',
    'Odłóż teczkę i podnieś ją później.',
  );
  row(swatch(colors.furnitureTop), 'Meble', 'Przeszkoda, trzeba ją obejść.');
  row(
    `<circle cx="${lx + 38}" cy="${ly + 20}" r="17" fill="${playerColors[0]}" stroke="${colors.outline}" stroke-width="3.5"/><text x="${lx + 38}" y="${ly + 27}" text-anchor="middle" font-family="'Baloo 2',sans-serif" font-weight="800" font-size="19" fill="${colors.outline}">1</text>`,
    'Start gracza',
    'Numer = miejsce przy biurku.',
  );
  for (const kind of used) {
    row(
      `<rect x="${lx + 20}" y="${ly + 2}" width="36" height="36" rx="9" fill="${STATION_FILL}" stroke="${colors.blue}" stroke-width="4.5"/>${wrapIcon(iconSvg(ICON_FOR_STATION[kind], 24, colors.outline, colors.yellow), lx + 26, ly + 8)}`,
      stationLabel(kind),
      STATION_PURPOSE[kind],
    );
  }

  const title = number === 0 ? `Trening: ${level.title}` : `Poziom ${number}: ${level.title}`;
  const stats = `${minutes} min · ${level.schedule.length} teczek · ${used.length} ${used.length === 1 ? 'stanowisko' : used.length < 5 ? 'stanowiska' : 'stanowisk'}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Plan redakcji, ${esc(title)}">
<title>Plan redakcji: ${esc(title)}</title>
<style>${fontCss('../')}</style>
<rect width="${width}" height="${height}" fill="${colors.sky}"/>
<text x="${MARGIN}" y="48" font-family="'Baloo 2',sans-serif" font-weight="800" font-size="34" fill="${colors.outline}">Plan redakcji · ${esc(title)}</text>
<text x="${MARGIN}" y="76" font-family="Nunito,sans-serif" font-weight="700" font-size="17" fill="${colors.outline}">${level.topic ? `Temat dnia: ${esc(level.topic)} · ` : ''}${esc(stats)}</text>
${parts.join('\n')}
${labels.join('\n')}
${legend.join('\n')}
</svg>
`;
}

export async function buildMaps(): Promise<string[]> {
  await copyFonts();
  const browser = await launchBrowser();
  const written: string[] = [];
  try {
    for (const level of LEVELS) {
      const svgPath = outPath('maps', `${level.id}.svg`);
      await writeOut(svgPath, mapSvg(level));
      const map = parseLayout(level.layout);
      const width = MARGIN * 2 + map.width * T + LEGEND_W + 24;
      await renderPng(browser, svgPath, outPath('maps', `${level.id}.png`), width, 'auto');
      written.push(`maps/${level.id}.png`);
    }
  } finally {
    await browser.close();
  }
  return written;
}

if (import.meta.main) {
  console.log((await buildMaps()).join('\n'));
}
