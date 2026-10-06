// Routes gameplay events from the server to feedback (cues) and transient UI state. Player
// join/leave events are handled in session.ts; everything else lands here. Each event gets
// a cue in S2-12; until then only the events with an existing cue make a sound.
import type { GameEvent } from '@redakcja/shared';
import { emitCue } from '../fx/feedback.ts';

export type GameplayEvent = Exclude<
  GameEvent,
  { kind: 'playerJoined' | 'playerLeft' | 'playerReconnected' | 'gameStarted' }
>;

export function handleGameEvent(event: GameplayEvent): void {
  switch (event.kind) {
    case 'stampApplied':
      emitCue('stamp.applied');
      return;
    default:
      return;
  }
}
