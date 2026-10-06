// Mobile browser helpers: fullscreen, screen wake lock (agents/platforms.md).
import { useEffect } from 'react';

export function canFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      // Best effort: lock landscape on Android when fullscreen.
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: 'landscape') => Promise<void>;
      };
      await orientation.lock?.('landscape').catch(() => {});
    }
  } catch {
    // Not allowed (iOS Safari): the web app manifest covers "add to home screen" instead.
  }
}

type WakeLockSentinelLike = { release(): Promise<void> };

/** Keeps the screen on while mounted; re-acquires after the tab becomes visible again. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
    };
    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;
    const acquire = async () => {
      try {
        const lock = await nav.wakeLock?.request('screen');
        if (disposed) {
          await lock?.release();
        } else {
          sentinel = lock ?? null;
        }
      } catch {
        // Denied or unsupported.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, [active]);
}
