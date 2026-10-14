// Ping bubbles currently shown above players, fed by `ping` events from the server. Each bubble
// expires after PING_DURATION_MS; a newer ping from the same player replaces the older one.
// Each GameView (net/game-view.ts) has its own bubbles; the module exports are the player view's.
import { PING_DURATION_MS, type PingKind } from '@redakcja/shared';
import { create } from 'zustand';

export type PingBubble = { ping: PingKind; seq: number };

type BubbleState = { bubbles: Readonly<Record<string, PingBubble>> };

/** A fresh set of ping bubbles: one per GameView (S7-85). */
export function createBubbleStore() {
  const use = create<BubbleState>(() => ({ bubbles: {} }));
  let seq = 0;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function show(playerId: string, ping: PingKind, durationMs = PING_DURATION_MS): void {
    seq++;
    const bubble: PingBubble = { ping, seq };
    use.setState((s) => ({ bubbles: { ...s.bubbles, [playerId]: bubble } }));
    const previous = timers.get(playerId);
    if (previous !== undefined) {
      clearTimeout(previous);
    }
    timers.set(
      playerId,
      setTimeout(() => {
        timers.delete(playerId);
        use.setState((s) => {
          if (s.bubbles[playerId]?.seq !== bubble.seq) {
            return s;
          }
          const { [playerId]: _, ...rest } = s.bubbles;
          return { bubbles: rest };
        });
      }, durationMs),
    );
  }

  function clear(): void {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    use.setState({ bubbles: {} });
  }

  return { use, show, clear };
}

export type BubbleStoreApi = ReturnType<typeof createBubbleStore>;

/** The player view's ping bubbles. */
export const playerBubbles: BubbleStoreApi = createBubbleStore();
export const usePingBubbles = playerBubbles.use;
export const showPingBubble = playerBubbles.show;
export const clearPingBubbles = playerBubbles.clear;
