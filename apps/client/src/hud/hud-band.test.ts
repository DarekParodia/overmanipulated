import { describe, expect, test } from 'bun:test';
import { bandBottom, HUD_BAND_MAX_SHARE, useHudBand } from './hud-band.ts';

describe('bandBottom', () => {
  test('is the lowest bottom of the HUD boxes', () => {
    // 640x360: pill 8..60, queue with its tag overhang 8..64, menu button 8..56.
    const rects = [
      { top: 8, bottom: 60 },
      { top: 8, bottom: 64 },
      { top: 8, bottom: 56 },
    ];
    expect(bandBottom(rects, 360)).toBe(64);
  });

  test('rounds a fractional edge up to whole pixels', () => {
    expect(bandBottom([{ top: 8, bottom: 63.2 }], 360)).toBe(64);
  });

  test('ignores boxes that start in the lower half of the screen', () => {
    const rects = [
      { top: 8, bottom: 60 },
      { top: 180, bottom: 200 },
      { top: 250, bottom: 340 },
    ];
    expect(bandBottom(rects, 360)).toBe(60);
  });

  test('caps the band at 30% of the screen height', () => {
    expect(HUD_BAND_MAX_SHARE).toBe(0.3);
    expect(bandBottom([{ top: 8, bottom: 150 }], 360)).toBe(108);
    expect(bandBottom([{ top: 12, bottom: 400 }], 768)).toBe(230);
  });

  test('is 0 with nothing measured or no screen', () => {
    expect(bandBottom([], 360)).toBe(0);
    expect(bandBottom([{ top: 8, bottom: 60 }], 0)).toBe(0);
    expect(bandBottom([{ top: 8, bottom: 60 }], Number.NaN)).toBe(0);
  });

  test('desktop 1366x768: the taller queue sets the band', () => {
    const rects = [
      { top: 12, bottom: 98 },
      { top: 12, bottom: 117 },
      { top: 12, bottom: 68 },
    ];
    expect(bandBottom(rects, 768)).toBe(117);
  });
});

describe('useHudBand', () => {
  test('stores the measured band and keeps the state when it does not change', () => {
    useHudBand.getState().set({ px: 64, pillRightPx: 320 });
    const before = useHudBand.getState();
    expect(before.px).toBe(64);
    expect(before.pillRightPx).toBe(320);
    useHudBand.getState().set({ px: 64, pillRightPx: 320 });
    expect(useHudBand.getState()).toBe(before);
    useHudBand.getState().set({ px: 64, pillRightPx: 338 });
    expect(useHudBand.getState().pillRightPx).toBe(338);
    useHudBand.getState().set({ px: 0, pillRightPx: 0 });
    expect(useHudBand.getState().px).toBe(0);
  });
});
