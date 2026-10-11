// Asset progress model (S5-07). Every asset the first match needs is a task; a task reports a
// measured fraction (bytes read from the network, or done/not done for a single step such as the
// lazy game chunk) and the loading screen shows the byte-weighted total. Nothing here is faked:
// the bar only moves when something really arrived.
import { create } from 'zustand';

export type TaskId = 'fonts' | 'game' | 'sfx' | 'music';

export type TaskState = 'pending' | 'running' | 'done' | 'failed';

export type Task = {
  id: TaskId;
  /** Approximate size in bytes; replaced by the real size once the response headers are in. */
  weight: number;
  /** 0..1 */
  fraction: number;
  state: TaskState;
  /** Blocks the game screen until done (a failed blocking task is skipped, never fatal). */
  blocking: boolean;
};

/** Gzip/brotli-ish sizes of what a first match needs; refined from real headers while loading. */
export const TASK_DEFAULTS: Record<TaskId, Pick<Task, 'weight' | 'blocking'>> = {
  fonts: { weight: 80_000, blocking: true },
  game: { weight: 290_000, blocking: true },
  sfx: { weight: 160_000, blocking: false },
  music: { weight: 360_000, blocking: false },
};

export function initialTasks(): Record<TaskId, Task> {
  const make = (id: TaskId): Task => ({
    id,
    ...TASK_DEFAULTS[id],
    fraction: 0,
    state: 'pending',
  });
  return { fonts: make('fonts'), game: make('game'), sfx: make('sfx'), music: make('music') };
}

const finished = (task: Task) => task.state === 'done' || task.state === 'failed';

/** Byte-weighted completion of all tasks, 0..1. A failed task counts as finished. */
export function overallFraction(tasks: Record<TaskId, Task>): number {
  let total = 0;
  let loaded = 0;
  for (const task of Object.values(tasks)) {
    total += task.weight;
    loaded += task.weight * (finished(task) ? 1 : Math.min(1, Math.max(0, task.fraction)));
  }
  return total === 0 ? 1 : loaded / total;
}

/** True when everything that blocks the game screen is finished. */
export function blockingDone(tasks: Record<TaskId, Task>): boolean {
  return Object.values(tasks).every((task) => !task.blocking || finished(task));
}

export function allDone(tasks: Record<TaskId, Task>): boolean {
  return Object.values(tasks).every(finished);
}

type LoadingStore = {
  tasks: Record<TaskId, Task>;
  start(id: TaskId): void;
  /** Reports measured progress; `weight` replaces the estimate when the real size is known. */
  report(id: TaskId, fraction: number, weight?: number): void;
  finish(id: TaskId, ok?: boolean): void;
  reset(): void;
};

function patch(
  tasks: Record<TaskId, Task>,
  id: TaskId,
  change: Partial<Task>,
): Record<TaskId, Task> {
  return { ...tasks, [id]: { ...tasks[id], ...change } };
}

export const useLoading = create<LoadingStore>((set) => ({
  tasks: initialTasks(),
  start: (id) => set((s) => ({ tasks: patch(s.tasks, id, { state: 'running' }) })),
  report: (id, fraction, weight) =>
    set((s) => ({
      tasks: patch(s.tasks, id, {
        fraction,
        ...(weight !== undefined && weight > 0 ? { weight } : {}),
      }),
    })),
  finish: (id, ok = true) =>
    set((s) => ({
      tasks: patch(s.tasks, id, {
        fraction: ok ? 1 : s.tasks[id].fraction,
        state: ok ? 'done' : 'failed',
      }),
    })),
  reset: () => set({ tasks: initialTasks() }),
}));
