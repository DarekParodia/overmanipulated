// Caption stack (S5-05): short icon + word chips for sounds that carry information, in a
// compact column on the left under the HUD pill — clear of the HUD numbers, the folder queue,
// the event banners (right) and the touch controls (bottom corners). Also offers captions once
// when the sound is muted.
import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './CaptionStack.module.css';
import { nextExpiry } from './caption-model.ts';
import { useCaptions } from './caption-store.ts';

/** The "turn captions on?" offer is made once per page load, however often sound is muted. */
let suggestionDismissed = false;

export function shouldSuggestCaptions(muted: boolean, captions: boolean, dismissed: boolean) {
  return muted && !captions && !dismissed;
}

export function CaptionStack() {
  const enabled = useSettings((s) => s.captions);
  const muted = useSettings((s) => s.muted);
  const update = useSettings((s) => s.update);
  const chips = useCaptions((s) => s.chips);
  const [dismissed, setDismissed] = useState(suggestionDismissed);

  useEffect(() => {
    const soonest = nextExpiry({ chips, nextId: 0 });
    if (soonest === null) {
      return;
    }
    const handle = window.setTimeout(
      () => useCaptions.getState().prune(),
      Math.max(0, soonest - performance.now()) + 16,
    );
    return () => window.clearTimeout(handle);
  }, [chips]);

  const suggest = shouldSuggestCaptions(muted, enabled, dismissed);
  if (!enabled && !suggest) {
    return null;
  }

  return (
    <section className={styles.stack} aria-label={pl.a11y.captionsRegion}>
      {suggest && (
        <div className={styles.suggest}>
          <Button
            icon={<Icon name="soundOff" size={24} />}
            onClick={() => {
              update({ captions: true });
              suggestionDismissed = true;
              setDismissed(true);
            }}
          >
            {pl.a11y.suggestAction}
          </Button>
          <Button
            back
            icon={<Icon name="close" size={24} label={pl.a11y.suggestDismiss} />}
            onClick={() => {
              suggestionDismissed = true;
              setDismissed(true);
            }}
          />
        </div>
      )}
      {enabled && (
        <ul className={styles.list} aria-live="off">
          {chips.map((chip) => (
            <li
              key={`${chip.id}-${chip.rev}`}
              className={`${styles.chip} ${styles[chip.tone]}`}
              data-testid="caption"
            >
              <span className={styles.mark}>
                <Icon name={chip.icon} size={22} />
              </span>
              <span className={styles.text}>{chip.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
