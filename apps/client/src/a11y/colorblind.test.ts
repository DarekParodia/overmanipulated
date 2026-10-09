import { describe, expect, it } from 'bun:test';
import { playerShapes } from '../ui/PlayerMark.tsx';
import { colors, playerColors } from '../ui/tokens.ts';
import {
  contrastRatio,
  deficiencies,
  deltaE2000,
  distance,
  MIN_DISTINGUISHABLE,
  parseHex,
  simulate,
  toLab,
} from './colorblind.ts';
import { meaningPairs } from './meaning-pairs.ts';

describe('colour maths', () => {
  it('leaves greys alone under every deficiency', () => {
    for (const deficiency of deficiencies) {
      const [r, g, b] = simulate([128, 128, 128], deficiency);
      expect(Math.abs(r - 128)).toBeLessThanOrEqual(2);
      expect(Math.abs(g - 128)).toBeLessThanOrEqual(2);
      expect(Math.abs(b - 128)).toBeLessThanOrEqual(2);
    }
  });

  it('matches known CIEDE2000 reference pairs (Sharma et al.)', () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(deltaE2000([50, 3.1571, -77.2803], [50, 0, -82.7485])).toBeCloseTo(2.8615, 3);
    expect(deltaE2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 3);
  });

  it('converts black and white to Lab', () => {
    expect(toLab(parseHex('#000000'))[0]).toBeCloseTo(0, 1);
    expect(toLab(parseHex('#ffffff'))[0]).toBeCloseTo(100, 0);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('sees red and green collapse for deuteranopes but not for normal vision', () => {
    expect(distance(colors.green, colors.red, 'normal')).toBeGreaterThan(MIN_DISTINGUISHABLE);
    expect(distance(colors.green, colors.red, 'deuteranopia')).toBeLessThan(MIN_DISTINGUISHABLE);
  });
});

describe('meaning colour pairs', () => {
  it('lists every pair of player colours', () => {
    expect(meaningPairs.filter((p) => p.id.startsWith('player-')).length).toBe(6);
  });

  it('either stay distinguishable in every deficiency or name a redundant channel', () => {
    const unprotected: string[] = [];
    for (const pair of meaningPairs) {
      for (const deficiency of deficiencies) {
        const d = distance(pair.a, pair.b, deficiency);
        if (d < MIN_DISTINGUISHABLE && pair.redundancy.trim().length < 10) {
          unprotected.push(`${pair.id} (${deficiency}: ${d.toFixed(1)})`);
        }
      }
    }
    expect(unprotected).toEqual([]);
  });

  it('keeps colours that look the same to normal vision out of the table', () => {
    for (const pair of meaningPairs) {
      expect(distance(pair.a, pair.b, 'normal')).toBeGreaterThan(MIN_DISTINGUISHABLE - 1);
    }
  });

  it('gives every player colour its own shape', () => {
    expect(new Set(playerShapes).size).toBe(playerColors.length);
  });

  it('keeps navy text readable (large bold UI text, 3:1) on every meaning fill', () => {
    const fills = [
      colors.green,
      colors.red,
      colors.orange,
      colors.yellow,
      colors.blue,
      colors.purple,
      ...playerColors,
    ];
    for (const fill of fills) {
      expect(contrastRatio(colors.outline, fill)).toBeGreaterThanOrEqual(3);
    }
  });
});
