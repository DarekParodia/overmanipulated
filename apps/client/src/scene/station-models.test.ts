import { describe, expect, it } from 'bun:test';
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import { Color } from 'three';
import { colors } from '../ui/tokens.ts';
import { FOLDER_SIZE, SURFACE_HEIGHT } from './entities.ts';
import { OUTLINE } from './models.ts';
import { stationGeometry } from './station-models.ts';

/** Half of the folder footprint that must stay clear in the middle of the top. */
const CLEAR_HALF_X = FOLDER_SIZE.width / 2;
const CLEAR_HALF_Z = FOLDER_SIZE.depth / 2;
/** How far above the working surface a part may reach inside the folder area. */
const CLEAR_MARGIN = 0.03;
/** Models stay inside their tile with room for the neighbour's outline. */
const FOOTPRINT = 0.55;
/** Float slack for parts placed exactly on a limit. */
const EPS = 1e-6;

const NEW_KINDS = ['geolocation', 'transcript', 'crossCheck', 'metadata'] as const;

function vertices(kind: StationKind, detail: boolean): [number, number, number][] {
  const position = stationGeometry(kind, detail).getAttribute('position');
  const out: [number, number, number][] = [];
  for (let i = 0; i < position.count; i++) {
    out.push([position.getX(i), position.getY(i), position.getZ(i)]);
  }
  return out;
}

function vertexColors(kind: StationKind): Set<string> {
  const color = stationGeometry(kind, true).getAttribute('color');
  const c = new Color();
  const out = new Set<string>();
  for (let i = 0; i < color.count; i++) {
    out.add(`#${c.setRGB(color.getX(i), color.getY(i), color.getZ(i)).getHexString()}`);
  }
  return out;
}

describe('stationGeometry', () => {
  it('covers ten station kinds', () => {
    expect(STATION_KINDS.length).toBe(10);
  });

  for (const kind of STATION_KINDS) {
    for (const detail of [false, true]) {
      it(`${kind} (detail ${detail}) keeps the folder area clear and fits its tile`, () => {
        let topInFolderArea = 0;
        let reach = 0;
        let bottom = 0;
        for (const [x, y, z] of vertices(kind, detail)) {
          if (Math.abs(x) < CLEAR_HALF_X && Math.abs(z) < CLEAR_HALF_Z) {
            topInFolderArea = Math.max(topInFolderArea, y);
          }
          reach = Math.max(reach, Math.abs(x), Math.abs(z));
          bottom = Math.min(bottom, y);
        }
        expect(topInFolderArea).toBeLessThanOrEqual(SURFACE_HEIGHT[kind] + CLEAR_MARGIN + EPS);
        expect(reach).toBeLessThanOrEqual(FOOTPRINT + EPS);
        // Only the plinth's outline hull dips under the floor.
        expect(bottom).toBeGreaterThanOrEqual(-OUTLINE - EPS);
      });
    }
  }

  it('gives the four Stage 7 stations a working surface of 0.76', () => {
    for (const kind of NEW_KINDS) {
      expect(SURFACE_HEIGHT[kind]).toBe(0.76);
    }
  });

  it('keeps purple (the AI scanner) off the four Stage 7 stations', () => {
    expect(vertexColors('aiScanner').has(colors.purple)).toBe(true);
    for (const kind of NEW_KINDS) {
      expect(vertexColors(kind).has(colors.purple)).toBe(false);
    }
  });

  it('builds every kind as one merged mesh (one draw call)', () => {
    for (const kind of STATION_KINDS) {
      for (const detail of [false, true]) {
        const geometry = stationGeometry(kind, detail);
        expect(geometry.groups.length).toBe(0);
        expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
        expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
      }
    }
  });

  it('builds a model with its own vertex count for every kind', () => {
    const counts = new Set(STATION_KINDS.map((kind) => vertices(kind, true).length));
    expect(counts.size).toBe(10);
  });
});
