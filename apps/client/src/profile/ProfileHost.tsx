// Mounts the profile (S7-104) lazily: its chunk is downloaded the first time someone opens it, so
// the menu stays light; tools/perf/check-bundle.ts counts it in the extras route. The dialog
// closes itself when the screen changes (joining a room), so it never hides a new screen.
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import { useApp } from '../store/app.ts';
import { useProfile } from '../store/profile.ts';

/** The chunk could not be loaded (offline): close again instead of breaking the page. */
function Unavailable() {
  useEffect(() => useProfile.getState().hide(), []);
  return null;
}

const ProfileDialog = lazy(() =>
  import('./ProfileDialog.tsx').then(
    (module): { default: ComponentType } => ({ default: module.ProfileDialog }),
    (): { default: ComponentType } => ({ default: Unavailable }),
  ),
);

export function ProfileHost() {
  const open = useProfile((s) => s.open);
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) {
    setLoaded(true);
  }

  useEffect(
    () =>
      useApp.subscribe((state, previous) => {
        if (state.screen !== previous.screen && useProfile.getState().open) {
          useProfile.getState().hide();
        }
      }),
    [],
  );

  return loaded ? (
    <Suspense fallback={null}>
      <ProfileDialog />
    </Suspense>
  ) : null;
}
