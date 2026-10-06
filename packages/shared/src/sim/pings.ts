// Pings (Q): quick signals to the team, shown above the player for a moment (S2-11).
import { PING_COOLDOWN_MS } from '../constants.ts';
import type { SimFrame } from './frame.ts';
import type { GameState } from './state.ts';

export function stepPings(state: GameState, frame: SimFrame): GameState {
  let crew = state.crew;
  for (const { playerId, command } of frame.commands) {
    const member = crew[playerId];
    if (command.kind !== 'ping' || !member) {
      continue;
    }
    if (state.elapsedMs - member.lastPingMs < PING_COOLDOWN_MS) {
      continue;
    }
    crew = { ...crew, [playerId]: { ...member, lastPingMs: state.elapsedMs } };
    frame.events.push({ kind: 'ping', playerId, ping: command.ping });
  }
  return crew === state.crew ? state : { ...state, crew };
}
