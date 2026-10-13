// Pause guard (S7-73), mounted once in App: ad requests are paused on every screen that may not
// hold an ad (play, briefing, styleguide). Our own slots only mount on ad screens; this stops
// Auto ads or an anchor unit switched on by mistake in the AdSense UI from loading during play.
// Before the loader has run (no ad screen seen yet) it does nothing.
import { useEffect } from 'react';
import { useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';
import { adEligible } from './ads-model.ts';
import { setAdRequestsPaused, useAdLoader } from './adsense.ts';

export function useAdRequestPause(): void {
  const screen = useApp((s) => s.screen);
  const levelEnded = useGame((s) => s.levelEnd !== null);
  // Re-applied once the loader has started, in case the first ad screen was left meanwhile.
  const loaderStarted = useAdLoader((s) => s.state !== 'idle');
  // S7-91 supplies the spectator view; until then nobody spectates.
  const spectating = false;

  useEffect(() => {
    if (loaderStarted) {
      setAdRequestsPaused(!adEligible({ screen, levelEnded, spectating }));
    }
  }, [screen, levelEnded, loaderStarted]);
}
