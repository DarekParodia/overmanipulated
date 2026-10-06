// Stores recent server snapshots and samples remote entities at a point in the past
// (render time = now − INTERPOLATION_DELAY_MS), interpolating between the two surrounding
// snapshots. Clock mapping uses the earliest-arrival estimate so jitter adds delay, not judder.
import {
  INTERPOLATION_DELAY_MS,
  type PlayerSnapshot,
  type SnapshotMessage,
  TICK_MS,
} from '@redakcja/shared';

/** Keep about one second of history. */
const MAX_SNAPSHOTS = 24;
/** How quickly the clock offset drifts back up when packets arrive later than the best case. */
const OFFSET_RELAX = 0.02;

export type SampledPlayer = Omit<PlayerSnapshot, 'lastInputSeq'>;

export type SnapshotBuffer = {
  push(snapshot: SnapshotMessage, receivedAt: number): void;
  /** Interpolated players at client time `now`; empty before the first snapshot. */
  sample(now: number, delayMs?: number): Map<string, SampledPlayer>;
  latest(): SnapshotMessage | null;
  /** Number of buffered snapshots ahead of the current render time (for diagnostics). */
  depth(now: number, delayMs?: number): number;
  clear(): void;
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates angles along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) {
    delta -= Math.PI * 2;
  } else if (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return a + delta * t;
}

export function createSnapshotBuffer(): SnapshotBuffer {
  let snapshots: SnapshotMessage[] = [];
  /** Estimated client time at which server tick 0 happened. */
  let offset: number | null = null;

  function renderTick(now: number, delayMs: number): number {
    if (offset === null) {
      return 0;
    }
    return (now - delayMs - offset) / TICK_MS;
  }

  return {
    push(snapshot, receivedAt) {
      const last = snapshots.at(-1);
      if (last && snapshot.tick <= last.tick) {
        return;
      }
      snapshots.push(snapshot);
      if (snapshots.length > MAX_SNAPSHOTS) {
        snapshots = snapshots.slice(-MAX_SNAPSHOTS);
      }
      const sampleOffset = receivedAt - snapshot.tick * TICK_MS;
      if (offset === null || sampleOffset < offset) {
        offset = sampleOffset;
      } else {
        offset += (sampleOffset - offset) * OFFSET_RELAX;
      }
    },

    sample(now, delayMs = INTERPOLATION_DELAY_MS) {
      const result = new Map<string, SampledPlayer>();
      const first = snapshots[0];
      if (!first) {
        return result;
      }
      const tick = renderTick(now, delayMs);
      let older = first;
      let newer = first;
      for (const snapshot of snapshots) {
        if (snapshot.tick <= tick) {
          older = snapshot;
          newer = snapshot;
        } else {
          newer = snapshot;
          break;
        }
      }
      const span = newer.tick - older.tick;
      const t = span > 0 ? Math.min(1, Math.max(0, (tick - older.tick) / span)) : 0;
      const olderById = new Map(older.players.map((p) => [p.id, p]));
      for (const to of newer.players) {
        const from = olderById.get(to.id) ?? to;
        result.set(to.id, {
          id: to.id,
          x: lerp(from.x, to.x, t),
          y: lerp(from.y, to.y, t),
          facing: lerpAngle(from.facing, to.facing, t),
          moving: t < 0.5 ? from.moving : to.moving,
        });
      }
      return result;
    },

    latest() {
      return snapshots.at(-1) ?? null;
    },

    depth(now, delayMs = INTERPOLATION_DELAY_MS) {
      const tick = renderTick(now, delayMs);
      return snapshots.filter((s) => s.tick > tick).length;
    },

    clear() {
      snapshots = [];
      offset = null;
    },
  };
}
