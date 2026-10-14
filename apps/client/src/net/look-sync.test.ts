import { describe, expect, it } from 'bun:test';
import { shouldSendLook } from './look-sync.ts';

describe('shouldSendLook (S7-105)', () => {
  it('sends while online in the lobby', () => {
    expect(shouldSendLook({ connection: 'online', room: { phase: 'lobby' } })).toBe(true);
  });

  it('never sends outside a room, offline or once the level is on', () => {
    expect(shouldSendLook({ connection: 'online', room: null })).toBe(false);
    expect(shouldSendLook({ connection: 'reconnecting', room: { phase: 'lobby' } })).toBe(false);
    for (const phase of ['briefing', 'playing', 'results']) {
      expect(shouldSendLook({ connection: 'online', room: { phase } })).toBe(false);
    }
  });
});
