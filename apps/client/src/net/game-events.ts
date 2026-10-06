// Routes gameplay events from the server to feedback (cues) and to UI listeners (toasts,
// overlays, ping bubbles). Player join/leave events are handled in session.ts; everything else
// lands here. The cue mapping below is completed in S2-12.
import type { GameEvent } from '@redakcja/shared';
import { emitCue } from '../fx/feedback.ts';

export type GameplayEvent = Exclude<
  GameEvent,
  { kind: 'playerJoined' | 'playerLeft' | 'playerReconnected' | 'gameStarted' }
>;

export type GameEventListener = (event: GameplayEvent) => void;

const listeners = new Set<GameEventListener>();

/** Subscribes to every gameplay event; returns the unsubscribe function. */
export function onGameEvent(listener: GameEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function handleGameEvent(event: GameplayEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
  playEventCue(event);
}

/** Feedback for each gameplay event (S2-12 fills this in). */
function playEventCue(event: GameplayEvent): void {
  switch (event.kind) {
    case 'stampApplied':
      emitCue('stamp.applied');
      return;
    default:
      return;
  }
}
