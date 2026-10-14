// Mounts „O grze” (S7-103) lazily, like „Jak grać” (`HowToPlayHost`): its chunk is downloaded
// the first time someone opens it, and tools/perf/check-bundle.ts counts it in the extras route.
// It closes itself when the screen changes, so it never hides a new screen.
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import { useApp } from '../store/app.ts';
import { useAbout } from './store.ts';

/** The chunk could not be loaded (offline): close again instead of breaking the page. */
function Unavailable() {
  useEffect(() => useAbout.getState().hide(), []);
  return null;
}

const AboutDialog = lazy(() =>
  import('./AboutDialog.tsx').then(
    (module): { default: ComponentType } => ({ default: module.AboutDialog }),
    (): { default: ComponentType } => ({ default: Unavailable }),
  ),
);

export function AboutHost() {
  const open = useAbout((s) => s.open);
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) {
    setLoaded(true);
  }

  useEffect(
    () =>
      useApp.subscribe((state, previous) => {
        if (state.screen !== previous.screen && useAbout.getState().open) {
          useAbout.getState().hide();
        }
      }),
    [],
  );

  return loaded ? (
    <Suspense fallback={null}>
      <AboutDialog />
    </Suspense>
  ) : null;
}
