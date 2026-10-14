// Sends the profile's look to the room (S7-105): whenever the colour or the accessory changes
// while this browser sits in a room's lobby, the room gets a `setLook`. The join carries the look
// itself (net/session.ts); outside the lobby the server would ignore it, so nothing is sent.
import { useApp } from '../store/app.ts';
import { profileLook, useProfile } from '../store/profile.ts';
import { setLook } from './session.ts';

/** Whether a look change now reaches the room (pure, for the test). */
export function shouldSendLook(state: {
  connection: string;
  room: { phase: string } | null;
}): boolean {
  return state.connection === 'online' && state.room?.phase === 'lobby';
}

/** Mount once (App); returns the unsubscribe function. */
export function startLookSync(): () => void {
  return useProfile.subscribe((state, previous) => {
    const before = previous.profile;
    const after = state.profile;
    if (before.color === after.color && before.accessory === after.accessory) {
      return;
    }
    if (shouldSendLook(useApp.getState())) {
      setLook(profileLook());
    }
  });
}
