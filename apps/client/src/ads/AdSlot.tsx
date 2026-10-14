// One fixed-size AdSense unit in a white "Reklama" frame (S7-73). It renders nothing unless ads
// are on for this host, the placement has an ad unit, the viewport fits the placement (never a
// phone) and the loader is not blocked. No cue, animation or sound: AdSense forbids drawing
// attention to ads. Not focusable: the ad iframe is outside the menu navigation's focus set.
// Screens mount it (S7-74); the spectate screen mounts its own in the stats sheet and the
// spectator results (S7-91).
import type { AdPlacement } from '@redakcja/shared';
import { memo, useEffect, useRef } from 'react';
import { useMediaQuery } from '../debrief/use-media-query.ts';
import { usePublicConfig } from '../store/public-config.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import styles from './AdSlot.module.css';
import { adRequestAttributes, slotFor } from './ads-model.ts';
import { adsense, fillSlot, useAdLoader } from './adsense.ts';
import { AD_PLACEMENTS } from './placements.ts';

const PLACEMENT_CLASS: Record<AdPlacement, string | undefined> = {
  menu: styles.menu,
  lobby: styles.lobby,
  results: styles.results,
  spectator: styles.spectator,
};

export type AdSlotProps = { placement: AdPlacement; className?: string | undefined };

// memo: the lobby re-renders on every roomState; the slot must not re-render, re-key or re-push.
export const AdSlot = memo(function AdSlot({ placement, className = '' }: AdSlotProps) {
  const ads = usePublicConfig((s) => s.config.ads);
  const blocked = useAdLoader((s) => s.state === 'blocked');
  const layout = AD_PLACEMENTS[placement];
  const fits = useMediaQuery(layout.query);
  const slot = slotFor(ads, placement);
  const client = ads.enabled ? ads.client : null;
  const shown = client !== null && slot !== null && fits && !blocked;
  const insRef = useRef<HTMLModElement>(null);

  // Keyed by the slot too: a new unit id remounts the <ins> (key), which needs its own push.
  useEffect(() => {
    const ins = insRef.current;
    if (shown && client !== null && slot !== null && ins) {
      void fillSlot(adsense, client, ins);
    }
  }, [shown, client, slot]);

  if (!shown || !ads.enabled) {
    return null;
  }
  return (
    <aside
      aria-label={pl.ads.label}
      data-ad-placement={placement}
      className={`${styles.rail} ${PLACEMENT_CLASS[placement] ?? ''} ${className}`}
    >
      <span className={styles.label} aria-hidden="true">
        {typeset(pl.ads.label)}
      </span>
      <ins
        key={slot}
        ref={insRef}
        className={`adsbygoogle ${styles.unit}`}
        style={{ width: layout.size.width, height: layout.size.height }}
        data-ad-client={ads.client}
        data-ad-slot={slot}
        {...adRequestAttributes(ads.mode, ads.ageTreatment)}
      />
    </aside>
  );
});
