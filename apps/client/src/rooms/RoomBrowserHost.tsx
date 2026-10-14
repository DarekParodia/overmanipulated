// Mounts the room browser (S7-88) lazily, like „O grze” (`AboutHost`): its chunk is downloaded
// the first time someone opens it, and tools/perf/check-bundle.ts counts it in the extras route.
// It closes itself when the screen changes (a join reached the lobby), and when the operator
// switches the browser off.
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import { useApp } from '../store/app.ts';
import { useFeature } from '../store/public-config.ts';
import { useRoomBrowser } from './store.ts';

/** The chunk could not be loaded (offline): close again instead of breaking the page. */
function Unavailable() {
  useEffect(() => useRoomBrowser.getState().hide(), []);
  return null;
}

const RoomBrowserDialog = lazy(() =>
  import('./RoomBrowserDialog.tsx').then(
    (module): { default: ComponentType } => ({ default: module.RoomBrowserDialog }),
    (): { default: ComponentType } => ({ default: Unavailable }),
  ),
);

export function RoomBrowserHost() {
  const open = useRoomBrowser((s) => s.open);
  const enabled = useFeature('roomBrowser');
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) {
    setLoaded(true);
  }

  useEffect(() => {
    if (!enabled && useRoomBrowser.getState().open) {
      useRoomBrowser.getState().hide();
    }
  }, [enabled]);

  useEffect(
    () =>
      useApp.subscribe((state, previous) => {
        if (state.screen !== previous.screen && useRoomBrowser.getState().open) {
          useRoomBrowser.getState().hide();
        }
      }),
    [],
  );

  return loaded ? (
    <Suspense fallback={null}>
      <RoomBrowserDialog />
    </Suspense>
  ) : null;
}
