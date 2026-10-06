// Ping picker state (S2-11, client part). Q / gamepad north / the touch "Sygnał" button open a
// small picker; choosing sends a `ping` command and the server echoes a `ping` event that every
// client shows as a bubble above the sender (PingBubbles).
import {
  PING_COOLDOWN_MS,
  PING_KINDS,
  PING_QUICK_REPEAT_MS,
  type PingKind,
} from '@redakcja/shared';
import { create } from 'zustand';
import type { NavIntent } from '../input/ui-nav.ts';

type PingStore = {
  open: boolean;
  /** `performance.now()` when the picker opened (for the quick repeat). */
  openedAt: number;
  /** Highlighted slip for keyboard / gamepad navigation. */
  selected: number;
  lastPing: PingKind | null;
  /** When `lastPing` was sent, so a quick repeat never lands inside the server cooldown. */
  lastSentAt: number;
};

export const usePings = create<PingStore>(() => ({
  open: false,
  openedAt: 0,
  selected: 0,
  lastPing: null,
  lastSentAt: Number.NEGATIVE_INFINITY,
}));

let sender: (ping: PingKind) => void = () => {};

/** The picker installs the function that actually sends (keeps this module free of net code). */
export function setPingSender(send: (ping: PingKind) => void): () => void {
  sender = send;
  return () => {
    if (sender === send) {
      sender = () => {};
    }
  };
}

export function openPingPicker(now: number): void {
  const { open, lastPing } = usePings.getState();
  if (open) {
    return;
  }
  const selected = lastPing ? PING_KINDS.indexOf(lastPing) : 0;
  usePings.setState({ open: true, openedAt: now, selected: Math.max(0, selected) });
}

export function closePingPicker(): void {
  if (usePings.getState().open) {
    usePings.setState({ open: false });
  }
}

export function choosePing(ping: PingKind, now: number): void {
  usePings.setState({ open: false, lastPing: ping, lastSentAt: now });
  sender(ping);
}

/**
 * The ping button (Q, pad north, touch "Sygnał") pressed while the picker is open: a quick
 * second press re-sends the last ping, a later one closes the picker.
 */
export function pressPingAgain(now: number): void {
  const { open, openedAt, lastPing, lastSentAt } = usePings.getState();
  if (!open) {
    return;
  }
  const quick = now - openedAt <= PING_QUICK_REPEAT_MS;
  if (lastPing && quick && now - lastSentAt >= PING_COOLDOWN_MS) {
    choosePing(lastPing, now);
    return;
  }
  closePingPicker();
}

export type NavOutcome =
  | { kind: 'select'; index: number }
  | { kind: 'choose'; ping: PingKind }
  | { kind: 'again' }
  | { kind: 'close' }
  | { kind: 'none' };

/** Pure: what a navigation intent does in the picker with `selected` highlighted. */
export function pickerNav(selected: number, intent: NavIntent): NavOutcome {
  const count = PING_KINDS.length;
  switch (intent) {
    case 'up':
    case 'left':
      return { kind: 'select', index: (selected + count - 1) % count };
    case 'down':
    case 'right':
      return { kind: 'select', index: (selected + 1) % count };
    case 'confirm': {
      const ping = PING_KINDS[selected];
      return ping ? { kind: 'choose', ping } : { kind: 'none' };
    }
    case 'back':
      return { kind: 'close' };
    case 'alt':
      return { kind: 'again' };
  }
}

/** Number keys 1–3 (top row or numpad) pick a ping directly. */
export function pingForKey(code: string): PingKind | null {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!match) {
    return null;
  }
  return PING_KINDS[Number(match[1]) - 1] ?? null;
}
