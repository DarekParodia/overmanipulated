import { describe, expect, it } from 'bun:test';
import type { Motd } from '@redakcja/shared';
import { MOTD_DISMISSED_KEY, visibleMotd } from './motd-model.ts';

const MOTD: Motd = {
  id: 'serwis-2026-10',
  text: 'W piątek od 20:00 przerwa w grze.',
  tone: 'info',
};

describe('visibleMotd', () => {
  it('shows a message nobody dismissed', () => {
    expect(visibleMotd(MOTD, null)).toEqual(MOTD);
  });

  it('hides the message whose id was dismissed', () => {
    expect(visibleMotd(MOTD, 'serwis-2026-10')).toBeNull();
  });

  it('shows a message with a new id after an older one was dismissed', () => {
    const next: Motd = { id: 'serwis-2026-11', text: 'Nowe poziomy już są!', tone: 'warning' };
    expect(visibleMotd(next, 'serwis-2026-10')).toEqual(next);
  });

  it('shows nothing when the server has no message', () => {
    expect(visibleMotd(null, null)).toBeNull();
    expect(visibleMotd(null, 'serwis-2026-10')).toBeNull();
  });

  it('keeps the dismissed id under one stable key', () => {
    expect(MOTD_DISMISSED_KEY).toBe('redakcja.motd.dismissed');
  });
});
