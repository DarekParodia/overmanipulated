// Mounts „Jak grać” (S7-96) lazily: its chunk (and later the intro's) is downloaded the first
// time someone opens it, so the menu stays light; tools/perf/check-bundle.ts counts it in the
// extras route. The dialog closes itself when the screen changes (the host starting the match,
// the briefing ending), so it never hides a new screen.
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react';
import { useApp } from '../store/app.ts';
import { useHowTo } from './store.ts';

/** The chunk could not be loaded (offline): close again instead of breaking the page. */
function Unavailable() {
  useEffect(() => useHowTo.getState().hide(), []);
  return null;
}

const HowToPlayDialog = lazy(() =>
  import('./HowToPlayDialog.tsx').then(
    (module): { default: ComponentType } => ({ default: module.HowToPlayDialog }),
    (): { default: ComponentType } => ({ default: Unavailable }),
  ),
);

export function HowToPlayHost() {
  const open = useHowTo((s) => s.open);
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) {
    setLoaded(true);
  }

  useEffect(
    () =>
      useApp.subscribe((state, previous) => {
        if (state.screen !== previous.screen && useHowTo.getState().open) {
          useHowTo.getState().hide();
        }
      }),
    [],
  );

  return loaded ? (
    <Suspense fallback={null}>
      <HowToPlayDialog />
    </Suspense>
  ) : null;
}
