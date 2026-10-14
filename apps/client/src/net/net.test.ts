import { describe, expect, it } from 'bun:test';
import {
  type Folder,
  GREYBOX_MAP,
  type PlayerCommand,
  type PlayerInput,
  type PlayerState,
  type Role,
  type RoomStateMessage,
  type SnapshotMessage,
  TICK_MS,
} from '@redakcja/shared';
import { feedback } from '../fx/feedback.ts';
import { touchInput } from '../input/input-manager.ts';
import { useApp } from '../store/app.ts';
import { reconnectDelayMs } from './backoff.ts';
import { selectCrewMember, useGame } from './game-store.ts';
import { createPredictor } from './prediction.ts';
import { createRuntime } from './runtime.ts';
import { createSnapshotBuffer, lerpAngle } from './snapshot-buffer.ts';

function snapshot(tick: number, x: number): SnapshotMessage {
  return {
    type: 'snapshot',
    tick,
    players: [{ id: 'p1', x, y: 5, facing: 0, moving: true, lastInputSeq: tick }],
    elapsedMs: tick * TICK_MS,
    timeLeftMs: 0,
    score: 0,
    credibility: 100,
    folders: [],
    stations: [],
    desks: [],
    nextFolder: { atMs: 3000, sinceMs: 0 },
    conveyorFull: false,
    crew: [{ id: 'p1', abilityReadyAtMs: 0, abilityArmed: false, fieldCall: null, rescuesLeft: 0 }],
    paused: false,
  };
}

describe('snapshot buffer', () => {
  it('interpolates between snapshots at render time = now − delay', () => {
    const buffer = createSnapshotBuffer();
    buffer.push(snapshot(10, 1), 500);
    buffer.push(snapshot(11, 2), 550);
    // Tick 10 arrived at t=500 → tick 10.5 corresponds to t=525; with 100 ms delay, now=625.
    const sampled = buffer.sample(625, 100).get('p1');
    expect(sampled?.x).toBeCloseTo(1.5, 5);
  });

  it('clamps to the newest snapshot instead of extrapolating', () => {
    const buffer = createSnapshotBuffer();
    buffer.push(snapshot(10, 1), 500);
    buffer.push(snapshot(11, 2), 550);
    expect(buffer.sample(5000, 100).get('p1')?.x).toBe(2);
  });

  it('absorbs late packets without moving the clock backwards', () => {
    const buffer = createSnapshotBuffer();
    buffer.push(snapshot(10, 1), 500);
    buffer.push(snapshot(11, 2), 640); // 90 ms late
    buffer.push(snapshot(12, 3), 600); // on time again
    const a = buffer.sample(625, 100).get('p1')?.x ?? 0;
    expect(a).toBeCloseTo(1.5, 5);
  });

  it('ignores out-of-order snapshots and reports depth', () => {
    const buffer = createSnapshotBuffer();
    buffer.push(snapshot(10, 1), 500);
    buffer.push(snapshot(9, 0), 510);
    expect(buffer.latest()?.tick).toBe(10);
    buffer.push(snapshot(11, 2), 550);
    expect(buffer.depth(600, 100)).toBe(1);
  });

  it('interpolates angles along the shortest arc', () => {
    expect(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 5);
  });
});

describe('prediction', () => {
  const idle = { interact: false, work: false };
  const right = (seq: number): PlayerInput => ({ seq, move: { x: 1, y: 0 }, actions: idle });
  const start: PlayerState = {
    id: 'p1',
    x: 3.5,
    y: 2.5,
    facing: 0,
    moving: false,
    lastInputSeq: -1,
  };

  it('moves immediately and matches the server after reconciliation', () => {
    const predictor = createPredictor(GREYBOX_MAP);
    predictor.reconcile(start);
    for (let seq = 0; seq < 5; seq++) {
      predictor.applyLocal(right(seq));
    }
    const predictedX = predictor.state?.x ?? 0;
    expect(predictedX).toBeGreaterThan(start.x);
    expect(predictor.pendingCount).toBe(5);

    // Server has processed 3 of 5 inputs with the same shared movement code.
    const authoritative = createPredictor(GREYBOX_MAP);
    authoritative.reconcile(start);
    for (let seq = 0; seq < 3; seq++) {
      authoritative.applyLocal(right(seq));
    }
    const ack = authoritative.state;
    if (!ack) {
      throw new Error('no state');
    }
    predictor.reconcile(ack);
    expect(predictor.pendingCount).toBe(2);
    expect(predictor.state?.x).toBeCloseTo(predictedX, 10);
    // No misprediction → no visual correction.
    expect(predictor.renderPosition(1).x).toBeCloseTo(predictedX, 10);
  });

  it('smooths a misprediction instead of snapping', () => {
    const predictor = createPredictor(GREYBOX_MAP);
    predictor.reconcile(start);
    predictor.applyLocal(right(0));
    const before = predictor.renderPosition(1).x;
    // Server says we were pushed back (e.g. it applied a different input).
    predictor.reconcile({ ...start, lastInputSeq: 0 });
    expect(predictor.renderPosition(1).x).toBeCloseTo(before, 10);
    for (let i = 0; i < 30; i++) {
      predictor.decayCorrection(TICK_MS);
    }
    expect(predictor.renderPosition(1).x).toBeCloseTo(start.x, 2);
  });

  it('snaps large corrections', () => {
    const predictor = createPredictor(GREYBOX_MAP);
    predictor.reconcile(start);
    predictor.applyLocal(right(0));
    predictor.reconcile({ ...start, x: 15.5, y: 10.5, lastInputSeq: 0 });
    expect(predictor.renderPosition(1)).toEqual({ x: 15.5, y: 10.5 });
  });
});

describe('reconnect backoff', () => {
  it('doubles up to five seconds', () => {
    expect([0, 1, 2, 3, 4, 10].map(reconnectDelayMs)).toEqual([500, 1000, 2000, 4000, 5000, 5000]);
  });
});

describe('game store', () => {
  it('stores the next folder and the conveyor-full flag, keeping an unchanged next folder', () => {
    useGame.getState().reset();
    expect(useGame.getState()).toMatchObject({ nextFolder: null, conveyorFull: false });
    useGame.getState().applySnapshot(snapshot(10, 1));
    const first = useGame.getState().nextFolder;
    expect(first).toEqual({ atMs: 3000, sinceMs: 0 });
    useGame.getState().applySnapshot(snapshot(11, 1));
    expect(useGame.getState().nextFolder).toBe(first);
    useGame.getState().applySnapshot({
      ...snapshot(12, 1),
      nextFolder: { atMs: 20_000, sinceMs: 3000 },
      conveyorFull: true,
    });
    expect(useGame.getState()).toMatchObject({
      nextFolder: { atMs: 20_000, sinceMs: 3000 },
      conveyorFull: true,
    });
    useGame.getState().applySnapshot({ ...snapshot(13, 1), nextFolder: null });
    expect(useGame.getState()).toMatchObject({ nextFolder: null, conveyorFull: false });
    useGame.getState().reset();
  });

  it('stores the crew’s ability state and finds a player in it (S7-36)', () => {
    useGame.getState().reset();
    expect(useGame.getState().crew).toEqual([]);
    const calling = { folderId: 'f2', endsAtMs: 9000 };
    useGame.getState().applySnapshot({
      ...snapshot(10, 1),
      crew: [
        {
          id: 'p1',
          abilityReadyAtMs: 70_000,
          abilityArmed: false,
          fieldCall: null,
          rescuesLeft: 0,
        },
        { id: 'p2', abilityReadyAtMs: 0, abilityArmed: false, fieldCall: calling, rescuesLeft: 0 },
      ],
    });
    const state = useGame.getState();
    expect(selectCrewMember(state, 'p1')?.abilityReadyAtMs).toBe(70_000);
    expect(selectCrewMember(state, 'p2')?.fieldCall).toEqual(calling);
    expect(selectCrewMember(state, 'p3')).toBeUndefined();
    expect(selectCrewMember(state, null)).toBeUndefined();
    useGame.getState().reset();
  });
});

describe('pause (S7-10)', () => {
  it('stores the paused flag from every snapshot', () => {
    useGame.getState().reset();
    expect(useGame.getState().paused).toBe(false);
    useGame.getState().applySnapshot({ ...snapshot(10, 1), paused: true });
    expect(useGame.getState().paused).toBe(true);
    // The pause snapshot repeats the last tick; the store still takes it.
    useGame.getState().applySnapshot({ ...snapshot(10, 1), paused: false });
    expect(useGame.getState().paused).toBe(false);
    useGame.getState().reset();
  });

  it('sends no input while the server holds the level, and re-learns the clock after', () => {
    const sent: number[] = [];
    const runtime = createRuntime(
      () => 'p1',
      (message) => sent.push(message.seq),
      () => {},
    );
    runtime.onSnapshot(snapshot(10, 1), 500);
    runtime.frame(600, 2 * TICK_MS);
    expect(sent).toEqual([0, 1]);

    runtime.onSnapshot({ ...snapshot(10, 1), paused: true }, 650);
    runtime.frame(700, 4 * TICK_MS);
    expect(sent).toEqual([0, 1]);

    // Resumed 10 s later: the buffer forgets the old offset instead of drawing from it.
    runtime.onSnapshot(snapshot(11, 2), 10_550);
    // Tick 11 arrived at 10 550, so just before that it is still ahead of the render time.
    expect(runtime.buffer.depth(10_549, 0)).toBe(1);
    runtime.frame(10_600, TICK_MS);
    expect(sent).toEqual([0, 1, 2]);
  });
});

function soloRoom(role: Role | null): RoomStateMessage {
  return {
    type: 'roomState',
    roomCode: 'ABCD',
    hostId: 'p1',
    phase: 'playing',
    levelId: 'l0-greybox',
    difficulty: 'normal',
    run: null,
    players: [
      {
        id: 'p1',
        nickname: 'Zośka',
        colorIndex: 0,
        connected: true,
        role,
        ready: true,
        team: 0,
        accessory: 'none',
      },
    ],
    briefing: null,
    blunderVotes: [],
    mode: 'coop',
    visibility: 'private',
    name: null,
    spectatorsAllowed: false,
    spectators: [],
  };
}

describe('role ability press (S7-39, gated by the shared preview in S7-40)', () => {
  /** A folder on the conveyor, so Przedłużenie has a target. */
  const folder: Folder = {
    id: 'f1',
    spawnKey: 's0',
    storyId: 'l0-zalany-rynek',
    location: { kind: 'fixture', fixtureId: 'conveyor-0' },
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
  };

  /** Runs one input tick after a touch press; returns what was sent and which cues played. */
  function pressOnce(role: Role | null, abilityReadyAtMs: number, folders: Folder[] = [folder]) {
    const commands: PlayerCommand[] = [];
    const cues: string[] = [];
    const stop = feedback.onCue((id) => cues.push(id));
    useApp.setState({ room: soloRoom(role) });
    const runtime = createRuntime(
      () => 'p1',
      () => {},
      (command) => commands.push(command),
    );
    const state = {
      ...snapshot(200, 1),
      folders,
      crew: [{ id: 'p1', abilityReadyAtMs, abilityArmed: false, fieldCall: null, rescuesLeft: 0 }],
    };
    runtime.onSnapshot(state, 500);
    useGame.getState().applySnapshot(state);
    touchInput.pressAbility();
    runtime.frame(600, TICK_MS);
    // The press is consumed: the next tick sends nothing more.
    runtime.frame(650, TICK_MS);
    stop();
    useApp.setState({ room: null });
    useGame.getState().reset();
    return { commands, cues: cues.filter((id) => id.startsWith('ability.')) };
  }

  it('sends useAbility once for a ready role ability', () => {
    // Snapshot tick 200 is level time 10 000 ms.
    expect(pressOnce('managingEditor', 10_000)).toEqual({
      commands: [{ kind: 'useAbility' }],
      cues: [],
    });
  });

  it('plays the denied cue and sends nothing while cooling or without a role', () => {
    expect(pressOnce('reporter', 10_050)).toEqual({ commands: [], cues: ['ability.denied'] });
    expect(pressOnce(null, 0)).toEqual({ commands: [], cues: ['ability.denied'] });
  });

  it('keeps a blocked press on the client: Przedłużenie with no folder in play', () => {
    expect(pressOnce('managingEditor', 0, [])).toEqual({
      commands: [],
      cues: ['ability.denied'],
    });
  });
});
