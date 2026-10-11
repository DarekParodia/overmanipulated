import { beforeEach, describe, expect, it } from 'bun:test';
import { fetchWithProgress } from './preload.ts';
import { allDone, blockingDone, initialTasks, overallFraction, useLoading } from './progress.ts';

describe('asset progress', () => {
  beforeEach(() => useLoading.getState().reset());

  it('starts at zero and reaches one only when every task finished', () => {
    expect(overallFraction(useLoading.getState().tasks)).toBe(0);
    for (const id of ['fonts', 'game', 'sfx', 'music'] as const) {
      useLoading.getState().finish(id);
    }
    expect(overallFraction(useLoading.getState().tasks)).toBe(1);
    expect(allDone(useLoading.getState().tasks)).toBe(true);
  });

  it('weights tasks by size and uses the real size once known', () => {
    const { report } = useLoading.getState();
    report('game', 0.5);
    const tasks = useLoading.getState().tasks;
    const total = Object.values(tasks).reduce((sum, t) => sum + t.weight, 0);
    expect(overallFraction(tasks)).toBeCloseTo((tasks.game.weight * 0.5) / total, 6);
    report('music', 0.5, 1_000_000);
    expect(useLoading.getState().tasks.music.weight).toBe(1_000_000);
  });

  it('blocks on fonts and the game chunk only, and treats a failure as finished', () => {
    const { finish } = useLoading.getState();
    expect(blockingDone(useLoading.getState().tasks)).toBe(false);
    finish('fonts');
    finish('game', false);
    expect(blockingDone(useLoading.getState().tasks)).toBe(true);
    expect(allDone(useLoading.getState().tasks)).toBe(false);
  });

  it('never reports more than 100 % or less than 0 %', () => {
    const tasks = initialTasks();
    tasks.game.fraction = 7;
    tasks.fonts.fraction = -3;
    const value = overallFraction(tasks);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});

describe('fetchWithProgress', () => {
  const chunked = (chunks: number[], headers: Record<string, string> = {}) =>
    (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const size of chunks) {
              controller.enqueue(new Uint8Array(size));
            }
            controller.close();
          },
        }),
        { headers },
      )) as unknown as typeof fetch;

  it('reports bytes as chunks arrive', async () => {
    const seen: [number, number][] = [];
    const bytes = await fetchWithProgress(
      '/x',
      (loaded, total) => seen.push([loaded, total]),
      chunked([10, 20, 30], { 'content-length': '60' }),
    );
    expect(bytes).toBe(60);
    expect(seen).toEqual([
      [10, 60],
      [30, 60],
      [60, 60],
      [60, 60],
    ]);
  });

  it('rejects on HTTP errors', async () => {
    const failing = (async () => new Response('no', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchWithProgress('/x', () => {}, failing)).rejects.toThrow('404');
  });
});
