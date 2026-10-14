// Feeds the local profile (S7-104) with the gameplay events of the match: every event that reaches
// the feedback also reaches the profile's tally. The finished level is added by net/session.ts.
import { useProfile } from '../store/profile.ts';
import { onGameEvent } from './game-events.ts';

/** Mount once (App); returns the unsubscribe function. */
export function startProfileTracking(): () => void {
  return onGameEvent((event) => useProfile.getState().trackEvent(event));
}
