// Ping bubbles currently shown above players, fed by `ping` events from the server. Each bubble
// expires after PING_DURATION_MS; a newer ping from the same player replaces the older one.
import { PING_DURATION_MS, type PingKind } from '@redakcja/shared';
import { create } from 'zustand';

export type PingBubble = { ping: PingKind; seq: number };

type BubbleStore = { bubbles: Readonly<Record<string, PingBubble>> };

export const usePingBubbles = create<BubbleStore>(() => ({ bubbles: {} }));

let seq = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function showPingBubble(
  playerId: string,
  ping: PingKind,
  durationMs = PING_DURATION_MS,
): void {
  seq++;
  const bubble: PingBubble = { ping, seq };
  usePingBubbles.setState((s) => ({ bubbles: { ...s.bubbles, [playerId]: bubble } }));
  const previous = timers.get(playerId);
  if (previous !== undefined) {
    clearTimeout(previous);
  }
  timers.set(
    playerId,
    setTimeout(() => {
      timers.delete(playerId);
      usePingBubbles.setState((s) => {
        if (s.bubbles[playerId]?.seq !== bubble.seq) {
          return s;
        }
        const { [playerId]: _, ...rest } = s.bubbles;
        return { bubbles: rest };
      });
    }, durationMs),
  );
}

export function clearPingBubbles(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
  usePingBubbles.setState({ bubbles: {} });
}
