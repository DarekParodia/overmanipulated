// End-to-end scenario through the whole stage 2 loop on the greybox level, driven only by
// inputs and commands: spawn → carry → station → minigame → desk verdict → score → level end.
import { describe, expect, it } from 'bun:test';
import type { GameEvent } from '../protocol.ts';
import {
  runStep,
  TEST_LEVEL,
  TEST_MAP,
  testCommand,
  testContext,
  testInput,
} from './__fixtures__/greybox.ts';
import type { QueuedCommand } from './frame.ts';
import { addPlayer, createGameState, type GameState } from './state.ts';
import type { PlayerInput } from './step.ts';

type Run = { state: GameState; events: GameEvent[]; seq: number };

function tick(run: Run, input: Partial<PlayerInput> = {}, commands: QueuedCommand[] = []): void {
  const result = runStep(
    run.state,
    { a: [{ ...testInput(run.seq++), ...input }] },
    commands,
    testContext(),
  );
  run.state = result.state;
  run.events.push(...result.events);
}

/** Walks player `a` to (x, y) one axis at a time, then (optionally) turns towards `face`. */
function walkTo(run: Run, x: number, y: number, face?: { x: number; y: number }): void {
  for (const axis of ['x', 'y'] as const) {
    for (let i = 0; i < 400; i++) {
      const player = run.state.players.a;
      const target = axis === 'x' ? x : y;
      const delta = target - (player?.[axis] ?? 0);
      if (Math.abs(delta) < 0.05) {
        break;
      }
      const step = Math.max(-1, Math.min(1, delta / 0.225));
      tick(run, { move: axis === 'x' ? { x: step, y: 0 } : { x: 0, y: step } });
    }
  }
  if (face) {
    // Pushing into the fixture turns the player towards it without moving.
    tick(run, { move: face });
  }
}

const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
const interact = { actions: { interact: true, work: false } };
const work = { actions: { interact: false, work: true } };

describe('stage 2 loop', () => {
  it('plays one folder from the conveyor to a correct verdict', () => {
    const spawn = TEST_MAP.spawns[0] ?? { x: 3.5, y: 4.5 };
    const run: Run = {
      state: addPlayer(createGameState({ map: TEST_MAP, seed: 3 }), 'a', spawn, 'photoEditor'),
      events: [],
      seq: 0,
    };

    // Wait for the first folder (t-true at 1 s) on conveyor-0 (col 1, row 1).
    while (!run.events.some((e) => e.kind === 'folderSpawned')) {
      tick(run);
    }
    walkTo(run, 1.5, 2.5, UP);
    tick(run, interact);
    expect(run.events.at(-1)).toMatchObject({ kind: 'folderPickedUp', folderId: 'f1' });

    // Image search is at col 8, row 1.
    walkTo(run, 8.5, 2.5, UP);
    tick(run, interact);
    expect(run.state.folders.f1?.location).toEqual({ kind: 'fixture', fixtureId: 'imageSearch-0' });
    while (!run.events.some((e) => e.kind === 'minigameStarted')) {
      tick(run, work);
    }
    tick(run, {}, [
      testCommand('a', { kind: 'minigameResult', stationId: 'imageSearch-0', success: true }),
    ]);
    expect(run.state.folders.f1?.stamps).toEqual(['t-true-image']);

    // Take it to the desk (col 9, row 7), going around the table block.
    tick(run, interact);
    expect(run.state.folders.f1?.location).toEqual({ kind: 'carried', playerId: 'a' });
    walkTo(run, 6.5, 2.5);
    walkTo(run, 6.5, 6.5);
    walkTo(run, 9.5, 6.5, DOWN);
    tick(run, interact);
    expect(run.state.folders.f1?.location).toEqual({ kind: 'fixture', fixtureId: 'desk-0' });
    tick(run, work);
    expect(run.state.desks['desk-0']?.operatorId).toBe('a');

    tick(run, {}, [
      testCommand('a', {
        kind: 'verdict',
        folderId: 'f1',
        verdict: 'publish',
        justifyingStampId: 't-true-image',
      }),
    ]);
    const verdict = run.events.find((e) => e.kind === 'verdictResult');
    expect(verdict).toMatchObject({ outcome: 'correct', scoreDelta: 15, speedBonus: true });
    expect(run.state.score).toBe(15);
    expect(run.state.folders.f1).toBeUndefined();
    expect(run.state.results).toHaveLength(1);
  });

  it('ends the level on time-out with stars by score', () => {
    let state = addPlayer(createGameState({ map: TEST_MAP }), 'a', { x: 6.5, y: 6.5 });
    state = { ...state, score: TEST_LEVEL.stars.two };
    const ctx = testContext({ level: { ...TEST_LEVEL, schedule: [], durationS: 1 } });
    for (let i = 0; i < 25 && !state.ended; i++) {
      state = runStep(state, {}, [], ctx).state;
    }
    expect(state.ended).toEqual({ won: true, stars: 2 });
  });
});
