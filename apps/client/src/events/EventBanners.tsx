// Event banners (S4-05..S4-09): when a level event starts (or an outage / raid is over) a
// chunky card slides in under the HUD pill with the event's icon, a short title and one short
// line. Up to two at a time, each leaves on its own. The sound, particles and camera shake come
// from the cue (fx/cues.ts); this is the visual announcement, so muted players get it too.
import { EVENT_BANNER_MS, fixtureById } from '@redakcja/shared';
import { useEffect, useRef } from 'react';
import { onGameEvent } from '../net/game-events.ts';
import { runtime } from '../net/session.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './EventBanners.module.css';
import { useEvents } from './event-store.ts';

/** Display name of the station standing on a fixture id. */
function stationName(stationId: string | undefined): string {
  const kind = stationId ? fixtureById(runtime.map, stationId)?.station : undefined;
  return kind ? pl.vocab.stations[kind] : pl.events.badge.down;
}

/** Routes level events into the event store while the game screen is mounted. */
export function useEventFeed(): void {
  useEffect(() => {
    useEvents.getState().reset();
    const unsubscribe = onGameEvent((event) => useEvents.getState().handle(event, stationName));
    return () => {
      unsubscribe();
      useEvents.getState().reset();
    };
  }, []);
}

export function EventBanners() {
  useEventFeed();
  const banners = useEvents((s) => s.banners);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const pending = timers.current;
    for (const banner of banners) {
      if (!pending.has(banner.id)) {
        pending.set(
          banner.id,
          window.setTimeout(() => {
            pending.delete(banner.id);
            useEvents.getState().dismiss(banner.id);
          }, EVENT_BANNER_MS),
        );
      }
    }
    // Banners pushed out of the stack no longer need their timers.
    for (const [id, handle] of pending) {
      if (!banners.some((b) => b.id === id)) {
        window.clearTimeout(handle);
        pending.delete(id);
      }
    }
  }, [banners]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const handle of pending.values()) {
        window.clearTimeout(handle);
      }
      pending.clear();
    };
  }, []);

  return (
    <ol className={styles.banners} aria-live="assertive" data-testid="event-banners">
      {banners.map((banner) => (
        <li
          key={banner.id}
          className={`${styles.banner} ${styles[banner.tone]}`}
          data-testid={`event-banner-${banner.event}`}
        >
          <span className={styles.mark}>
            <Icon name={banner.icon} size={30} />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{banner.title}</span>
            <span className={styles.line}>{banner.line}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
