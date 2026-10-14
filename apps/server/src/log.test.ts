import { describe, expect, it } from 'bun:test';
import { logLine } from './log.ts';

describe('logLine', () => {
  it('writes the time, level and message first, then the fields', () => {
    expect(logLine('2026-10-14T08:00:00.000Z', 'info', 'room created', { room: 'ABCD' })).toBe(
      '{"time":"2026-10-14T08:00:00.000Z","level":"info","message":"room created","room":"ABCD"}',
    );
  });

  it('never lets a field overwrite the entry level, time or message', () => {
    const line = logLine('2026-10-14T08:00:00.000Z', 'info', 'game started', {
      room: 'ABCD',
      levelId: 'l1-burza',
      level: 'l1-burza',
      message: 'x',
    });
    expect(line).toBe(
      '{"time":"2026-10-14T08:00:00.000Z","level":"info","message":"game started","room":"ABCD","levelId":"l1-burza"}',
    );
  });
});
