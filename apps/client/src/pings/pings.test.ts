import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { PING_COOLDOWN_MS, PING_QUICK_REPEAT_MS, type PingKind } from '@redakcja/shared';
import { clearPingBubbles, showPingBubble, usePingBubbles } from './bubble-store.ts';
import {
  closePingPicker,
  openPingPicker,
  pickerNav,
  pingForKey,
  pressPingAgain,
  setPingSender,
  usePings,
} from './ping-store.ts';

describe('ping picker navigation', () => {
  it('wraps the highlight around the three slips', () => {
    expect(pickerNav(0, 'up')).toEqual({ kind: 'select', index: 2 });
    expect(pickerNav(2, 'down')).toEqual({ kind: 'select', index: 0 });
    expect(pickerNav(1, 'right')).toEqual({ kind: 'select', index: 2 });
  });

  it('confirms the highlighted ping and maps back / alt', () => {
    expect(pickerNav(1, 'confirm')).toEqual({ kind: 'choose', ping: 'fake' });
    expect(pickerNav(0, 'back')).toEqual({ kind: 'close' });
    expect(pickerNav(0, 'alt')).toEqual({ kind: 'again' });
  });

  it('maps number keys 1–3 (row and numpad) to pings', () => {
    expect(pingForKey('Digit1')).toBe('needArchive');
    expect(pingForKey('Numpad2')).toBe('fake');
    expect(pingForKey('Digit3')).toBe('mine');
    expect(pingForKey('Digit4')).toBeNull();
    expect(pingForKey('KeyQ')).toBeNull();
  });
});

describe('ping picker store', () => {
  const sent: PingKind[] = [];
  let release = () => {};
  beforeEach(() => {
    sent.length = 0;
    release = setPingSender((ping) => sent.push(ping));
    usePings.setState({
      open: false,
      openedAt: 0,
      selected: 0,
      lastPing: null,
      lastSentAt: Number.NEGATIVE_INFINITY,
    });
  });
  afterEach(() => release());

  it('a second press closes the picker when no ping was sent before', () => {
    openPingPicker(1000);
    pressPingAgain(1100);
    expect(usePings.getState().open).toBe(false);
    expect(sent).toEqual([]);
  });

  it('a quick second press re-sends the last ping; a slow one only closes', () => {
    usePings.setState({ lastPing: 'mine' });
    openPingPicker(1000);
    expect(usePings.getState().selected).toBe(2);
    pressPingAgain(1000 + PING_QUICK_REPEAT_MS - 1);
    expect(sent).toEqual(['mine']);
    expect(usePings.getState().open).toBe(false);

    openPingPicker(5000);
    pressPingAgain(5000 + PING_QUICK_REPEAT_MS + 1);
    expect(sent).toEqual(['mine']);
    expect(usePings.getState().open).toBe(false);
  });

  it('a quick repeat inside the server cooldown only closes the picker', () => {
    usePings.setState({ lastPing: 'fake', lastSentAt: 1000 });
    openPingPicker(1100);
    pressPingAgain(1100 + PING_QUICK_REPEAT_MS - 1);
    expect(sent).toEqual([]);
    expect(usePings.getState().open).toBe(false);
    openPingPicker(1000 + PING_COOLDOWN_MS);
    pressPingAgain(1000 + PING_COOLDOWN_MS + 10);
    expect(sent).toEqual(['fake']);
  });

  it('closing is a no-op when closed', () => {
    closePingPicker();
    expect(usePings.getState().open).toBe(false);
  });
});

describe('ping bubbles', () => {
  // Short durations keep the suite fast; generous gaps keep it stable on a busy machine.
  const DURATION = 120;
  afterEach(() => {
    clearPingBubbles();
  });

  it('shows a bubble per player and expires it after its duration', async () => {
    showPingBubble('a', 'fake', DURATION);
    showPingBubble('b', 'mine', DURATION * 10);
    expect(usePingBubbles.getState().bubbles.a?.ping).toBe('fake');
    await Bun.sleep(DURATION * 3);
    expect(usePingBubbles.getState().bubbles.a).toBeUndefined();
    expect(usePingBubbles.getState().bubbles.b?.ping).toBe('mine');
  });

  it('a newer ping replaces the bubble and restarts its timer', async () => {
    showPingBubble('a', 'fake', DURATION);
    showPingBubble('a', 'mine', DURATION * 10);
    await Bun.sleep(DURATION * 3);
    expect(usePingBubbles.getState().bubbles.a?.ping).toBe('mine');
  });
});
