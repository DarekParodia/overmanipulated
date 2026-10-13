import { describe, expect, test } from 'bun:test';
import { ENDLESS_LAYOUT, LEVELS } from '@redakcja/content';
import { type Fixture, parseLayout, type TileMap } from '@redakcja/shared';
import { PerspectiveCamera, Vector3 } from 'three';
import { computeFraming, type Framing, placeCamera, setUpLens } from './camera-framing.ts';
import { SIGN_ABOVE, surfaceHeight } from './entities.ts';

/** The phone HUD band the one-row pill and the folder queue make (S7-11). */
const BAND = 64;
const NO_SHAKE = { x: 0, y: 0, roll: 0 };

const MAPS: readonly (readonly [string, TileMap])[] = [
  ...LEVELS.map((level) => [level.id, parseLayout(level.layout)] as const),
  ['endless', parseLayout(ENDLESS_LAYOUT)],
];

/** A camera settled on the framing (no smoothing left, no shake, no punch). */
function settled(framing: Framing, width: number, height: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, width / height);
  setUpLens(camera);
  const focus = new Vector3(framing.target.x, 0, framing.target.z);
  placeCamera(camera, focus, framing, { width, height }, 1, NO_SHAKE);
  camera.updateMatrixWorld();
  return camera;
}

/** Screen y in CSS px (0 at the top) of a world point. */
function screenY(camera: PerspectiveCamera, height: number, x: number, y: number, z: number) {
  const point = new Vector3(x, y, z).project(camera);
  return ((1 - point.y) / 2) * height;
}

function conveyors(map: TileMap): Fixture[] {
  return map.fixtures.filter((f) => f.kind === 'conveyor');
}

/** Sign feet over the back row (row 1): its stations and the conveyor run's „Wejście”. */
function backRowSigns(map: TileMap): { x: number; y: number; z: number }[] {
  const stations = map.fixtures
    .filter((f) => f.kind === 'station' && f.row === 1)
    .map((f) => ({ x: f.col + 0.5, y: surfaceHeight(f) + SIGN_ABOVE, z: f.row + 0.5 }));
  const belt = conveyors(map).filter((f) => f.row === 1);
  const first = belt[0];
  if (!first) {
    return stations;
  }
  const meanCol = belt.reduce((sum, f) => sum + f.col, 0) / belt.length;
  return [...stations, { x: meanCol + 0.5, y: surfaceHeight(first) + SIGN_ABOVE, z: 1.5 }];
}

describe('computeFraming', () => {
  test('every shipped room has a belt on the back row', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
    for (const [, map] of MAPS) {
      expect(conveyors(map).some((f) => f.row === 1)).toBe(true);
    }
  });

  for (const [width, height] of [
    [640, 360],
    [863, 360],
  ] as const) {
    test(`at ${width}x${height} with the player at the belt, belt and signs clear the band`, () => {
      for (const [id, map] of MAPS) {
        const first = conveyors(map)[0];
        if (!first) {
          throw new Error(`${id} has no conveyor`);
        }
        // The floor tile in front of the first conveyor tile.
        const local = { x: first.col + 0.5, y: first.row + 1.5 };
        const framing = computeFraming({
          width,
          height,
          mapW: map.width,
          mapH: map.height,
          local,
          topInsetPx: BAND,
        });
        expect(framing.follow).toBe(true);
        const camera = settled(framing, width, height);
        for (const tile of conveyors(map)) {
          const y = screenY(camera, height, tile.col + 0.5, 0.5, tile.row + 0.5);
          expect(y).toBeGreaterThanOrEqual(BAND + 4);
          expect(y).toBeLessThanOrEqual(height);
        }
        for (const sign of backRowSigns(map)) {
          expect(screenY(camera, height, sign.x, sign.y, sign.z)).toBeGreaterThanOrEqual(BAND);
        }
      }
    });
  }

  test('the band moves the belt down by half its height', () => {
    const map = parseLayout(LEVELS[0]?.layout ?? []);
    const input = { width: 640, height: 360, mapW: map.width, mapH: map.height };
    const local = { x: 2.5, y: 2.5 };
    const bare = settled(computeFraming({ ...input, local, topInsetPx: 0 }), 640, 360);
    const under = settled(computeFraming({ ...input, local, topInsetPx: BAND }), 640, 360);
    const belt = (camera: PerspectiveCamera) => screenY(camera, 360, 3.5, 0.5, 1.5);
    expect(belt(bare)).toBeCloseTo(135.8, 1);
    expect(belt(under)).toBeCloseTo(167.8, 1);
  });

  test('without a band the follow framing is the pre-band one', () => {
    expect(
      computeFraming({
        width: 640,
        height: 360,
        mapW: 20,
        mapH: 12,
        local: { x: 3, y: 2.5 },
        topInsetPx: 0,
      }),
    ).toEqual({
      follow: true,
      target: { x: 6.5, z: 2.5 },
      visibleDepth: 10.612605630258868,
      viewOffsetY: 0,
    });
    // Back of the room: the same clamps as before.
    const back = computeFraming({
      width: 863,
      height: 360,
      mapW: 24,
      mapH: 14,
      local: { x: 23, y: 13 },
      topInsetPx: 0,
    });
    expect(back.target.x).toBeCloseTo(14.7125, 4);
    expect(back.target.z).toBeCloseTo(10.1937, 4);
  });

  test('with a band the view is offset by half of it and clamped to the uncovered depth', () => {
    const framing = computeFraming({
      width: 863,
      height: 360,
      mapW: 24,
      mapH: 14,
      local: { x: 23, y: 13 },
      topInsetPx: BAND,
    });
    expect(framing.follow).toBe(true);
    expect(framing.viewOffsetY).toBe(-32);
    // The full screen depth stays the same: tiles keep their 40 px.
    expect(framing.visibleDepth).toBeCloseTo(10.6126, 4);
    expect(framing.target.x).toBeCloseTo(14.7125, 4);
    expect(framing.target.z).toBeCloseTo(11.137, 3);
  });

  test('the band counts for at most 30% of the screen height', () => {
    const framing = computeFraming({
      width: 640,
      height: 360,
      mapW: 20,
      mapH: 12,
      local: { x: 10, y: 6 },
      topInsetPx: 200,
    });
    expect(framing.viewOffsetY).toBe(-54);
  });

  test('a 1366x768 desktop fits the whole room and ignores the band', () => {
    const fit = {
      follow: false,
      target: { x: 10, z: 5.1 },
      visibleDepth: 17,
      viewOffsetY: 0,
    };
    for (const topInsetPx of [0, 180]) {
      expect(
        computeFraming({
          width: 1366,
          height: 768,
          mapW: 20,
          mapH: 12,
          local: { x: 3, y: 2.5 },
          topInsetPx,
        }),
      ).toEqual(fit);
    }
  });

  test('the 24x14 l6 room (S7-58) is fitted on desktop and followed on a phone', () => {
    const level = LEVELS.find((candidate) => candidate.id === 'l6-atak');
    const map = parseLayout(level?.layout ?? []);
    expect([map.width, map.height]).toEqual([24, 14]);
    const input = { mapW: map.width, mapH: map.height, local: { x: 3, y: 2.5 }, topInsetPx: BAND };
    // 1280/25.5 and 720/(19·sin 58°) both give at least the 40 px minimum tile: no follow.
    for (const [width, height] of [
      [1280, 720],
      [1366, 768],
    ] as const) {
      expect(computeFraming({ width, height, ...input })).toEqual({
        follow: false,
        target: { x: 12, z: 6.1 },
        visibleDepth: 19,
        viewOffsetY: 0,
      });
    }
    const phone = computeFraming({ width: 640, height: 360, ...input });
    expect(phone.follow).toBe(true);
    expect(phone.viewOffsetY).toBe(-32);
    expect(phone.target).toEqual({ x: 6.5, z: 2.5 });
  });

  test('the 24×14 level-5 room fits a 1280×720 desktop and is followed on phones (S7-57)', () => {
    const level = LEVELS.find((l) => l.id === 'l5-deepfake');
    const map = parseLayout(level?.layout ?? []);
    expect({ w: map.width, h: map.height }).toEqual({ w: 24, h: 14 });
    for (const [width, height] of [
      [1366, 768],
      [1280, 720],
    ] as const) {
      const fit = computeFraming({
        width,
        height,
        mapW: map.width,
        mapH: map.height,
        local: { x: 3, y: 2.5 },
        topInsetPx: BAND,
      });
      expect(fit.follow).toBe(false);
      expect(fit.target).toEqual({ x: 12, z: 6.1 });
    }
    // On a phone, standing in front of any station keeps that station on screen, under the band.
    const stations = map.fixtures.filter((f) => f.kind === 'station');
    expect(stations).toHaveLength(7);
    for (const [width, height] of [
      [640, 360],
      [863, 360],
    ] as const) {
      for (const station of stations) {
        const local = { x: station.col + 0.5, y: station.row + 1.5 };
        const framing = computeFraming({
          width,
          height,
          mapW: map.width,
          mapH: map.height,
          local,
          topInsetPx: BAND,
        });
        expect(framing.follow).toBe(true);
        const camera = settled(framing, width, height);
        const point = new Vector3(station.col + 0.5, 0.5, station.row + 0.5).project(camera);
        const x = ((point.x + 1) / 2) * width;
        const y = screenY(camera, height, station.col + 0.5, 0.5, station.row + 0.5);
        const onScreen = x >= 0 && x <= width && y >= BAND && y <= height;
        expect({ id: station.id, onScreen }).toEqual({ id: station.id, onScreen: true });
      }
    }
  });

  test('before the local player is known the room is fitted', () => {
    const framing = computeFraming({
      width: 640,
      height: 360,
      mapW: 20,
      mapH: 12,
      local: null,
      topInsetPx: BAND,
    });
    expect(framing.follow).toBe(false);
    expect(framing.viewOffsetY).toBe(0);
  });
});

describe('placeCamera', () => {
  test('places the camera above and behind the focus', () => {
    const framing = computeFraming({
      width: 1366,
      height: 768,
      mapW: 20,
      mapH: 12,
      local: null,
      topInsetPx: 0,
    });
    const camera = settled(framing, 1366, 768);
    expect(camera.position.x).toBeCloseTo(10, 4);
    expect(camera.position.y).toBeCloseTo(21.3188, 4);
    expect(camera.position.z).toBeCloseTo(18.4215, 4);
    expect(camera.view).toBeNull();
  });

  test('sets the view offset once and clears it in fit mode', () => {
    const camera = new PerspectiveCamera(50, 640 / 360);
    setUpLens(camera);
    let sets = 0;
    const setViewOffset = camera.setViewOffset.bind(camera);
    camera.setViewOffset = (...args) => {
      sets += 1;
      setViewOffset(...args);
    };
    const size = { width: 640, height: 360 };
    const base = { mapW: 20, mapH: 12, local: { x: 3, y: 2.5 }, topInsetPx: BAND };
    const follow = computeFraming({ ...size, ...base });
    const focus = new Vector3(follow.target.x, 0, follow.target.z);
    placeCamera(camera, focus, follow, size, 1, NO_SHAKE);
    placeCamera(camera, focus, follow, size, 1, NO_SHAKE);
    expect(sets).toBe(1);
    expect(camera.view?.enabled).toBe(true);
    expect(camera.view?.offsetY).toBe(-32);

    // A resize re-applies it for the new size.
    const wide = { width: 863, height: 360 };
    placeCamera(camera, focus, computeFraming({ ...wide, ...base }), wide, 1, NO_SHAKE);
    expect(sets).toBe(2);
    expect(camera.view?.fullWidth).toBe(863);

    const fit = computeFraming({ width: 1366, height: 768, ...base });
    placeCamera(camera, focus, fit, { width: 1366, height: 768 }, 1, NO_SHAKE);
    expect(camera.view?.enabled).toBe(false);
  });
});
