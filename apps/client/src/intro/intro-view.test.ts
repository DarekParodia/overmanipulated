import { describe, expect, it } from 'bun:test';
import { TICK_MS } from '@redakcja/shared';
import type { GameplayEvent } from '../net/game-events.ts';
import { useGame } from '../net/game-store.ts';
import { INTRO_PLAYER_ID } from './intro-sim.ts';
import { createIntroView, INTRO_LEVEL_THEME, INTRO_ROSTER, type IntroClock } from './intro-view.ts';

function setup(initial: IntroClock) {
  let clock: IntroClock = initial;
  const view = createIntroView(() => clock);
  const heard: GameplayEvent['kind'][] = [];
  view.bus.on((event) => heard.push(event.kind));
  const frame = (next: IntroClock) => {
    clock = next;
    return view.runtime.frame(0, TICK_MS);
  };
  return { view, heard, frame };
}

describe('intro view', () => {
  it('is its own view: the scripted reporter, the training theme, the room untouched', () => {
    const { view } = setup(null);
    expect(view.kind).toBe('intro');
    expect(view.subjectId()).toBe(INTRO_PLAYER_ID);
    expect(view.roster).toBe(INTRO_ROSTER);
    expect(INTRO_ROSTER.map((p) => [p.id, p.nickname, p.role])).toEqual([
      [INTRO_PLAYER_ID, 'Ty', 'photoEditor'],
    ]);
    expect(view.levelId).toBe(INTRO_LEVEL_THEME);
    expect(view.runtime.map.width).toBe(10);
    expect(view.store).not.toBe(useGame);
  });

  it('steps the sim to the scene time and feeds its own game store', () => {
    const { view, frame } = setup(null);
    expect(frame(null).size).toBe(0);
    frame({ track: 'conveyorArrivals', elapsedMs: 3100 });
    const state = view.store.getState();
    expect(state.tick).toBe(62);
    expect(state.folders.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(state.nextFolder).toEqual({ atMs: 5500, sinceMs: 3000 });
    expect(useGame.getState().folders).toEqual([]);
  });

  it('routes live ticks to the view, never the ticks of a jump', () => {
    const { heard, frame } = setup(null);
    // Opening the scene 2.95 s in replays 59 ticks silently: the first folder makes no burst.
    frame({ track: 'conveyorArrivals', elapsedMs: 2950 });
    expect(heard).toEqual([]);
    // From here the scene plays live: the second folder (3 s) is heard.
    for (let ms = 3000; ms <= 3100; ms += TICK_MS) {
      frame({ track: 'conveyorArrivals', elapsedMs: ms });
    }
    expect(heard).toEqual(['folderSpawned']);
  });

  it('starts the track again on Back or a restart', () => {
    const { view, frame } = setup(null);
    frame({ track: 'pickUpFolder', elapsedMs: 4000 });
    expect(view.store.getState().folders.find((f) => f.id === 'f1')?.location.kind).toBe('carried');
    frame({ track: 'pickUpFolder', elapsedMs: 100 });
    expect(view.store.getState().folders.find((f) => f.id === 'f1')?.location).toEqual({
      kind: 'fixture',
      fixtureId: 'conveyor-0',
    });
    // Another track starts where the previous scripts end: 6050 + 2000 ms = 161 ticks.
    frame({ track: 'holdWork', elapsedMs: 0 });
    expect(view.store.getState().tick).toBe(161);
  });

  it('draws the reporter between two ticks', () => {
    const { frame } = setup(null);
    const at = (ms: number) =>
      frame({ track: 'pickUpFolder', elapsedMs: ms }).get(INTRO_PLAYER_ID)?.x ?? 0;
    // Walking left after the 300 ms wait: half a tick later the reporter is halfway there.
    const a = at(500);
    const b = at(550);
    const half = at(525);
    expect(b).toBeLessThan(a);
    expect(half).toBeCloseTo((a + b) / 2, 5);
  });
});
