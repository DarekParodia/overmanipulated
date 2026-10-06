import { describe, expect, it } from 'bun:test';
import {
  GREYBOX_MAP,
  type PlayerInput,
  type PlayerState,
  type SnapshotMessage,
  TICK_MS,
} from '@redakcja/shared';
import { reconnectDelayMs } from './backoff.ts';
import { createPredictor } from './prediction.ts';
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
