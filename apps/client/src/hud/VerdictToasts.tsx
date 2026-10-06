// Verdict feedback: a big, short toast under the folder queue for every verdict and expired
// folder ("Dobrze! +30", "Fałszywka! −20", "Przepadło −5"), colour plus an outcome icon. At
// most two at once, newest on top; each disappears on its own.
import { useEffect, useRef, useState } from 'react';
import { onGameEvent } from '../net/game-events.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { HudGlyph } from './HudGlyph.tsx';
import { expiredToast, formatDelta, pushToast, type ToastSlip, verdictToast } from './hud-model.ts';
import { hudStory } from './story-lookup.ts';
import styles from './VerdictToasts.module.css';

const TOAST_MAX = 2;
const TOAST_MS = 3000;

export function VerdictToasts() {
  const [toasts, setToasts] = useState<ToastSlip[]>([]);
  const serial = useRef(0);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const pending = timers.current;
    const add = (slip: ToastSlip) => {
      setToasts((current) => pushToast(current, slip, TOAST_MAX));
      pending.set(
        slip.id,
        window.setTimeout(() => {
          pending.delete(slip.id);
          setToasts((current) => current.filter((t) => t.id !== slip.id));
        }, TOAST_MS),
      );
      // Toasts pushed out of the stack no longer need their timers (the map keeps age order).
      for (const [id, handle] of pending) {
        if (pending.size <= TOAST_MAX) {
          break;
        }
        window.clearTimeout(handle);
        pending.delete(id);
      }
    };
    const unsubscribe = onGameEvent((event) => {
      if (event.kind === 'verdictResult') {
        add(verdictToast(event, hudStory(event.storyId), serial.current++));
      } else if (event.kind === 'folderExpired') {
        add(expiredToast(event, hudStory(event.storyId), serial.current++));
      }
    });
    return () => {
      unsubscribe();
      for (const handle of pending.values()) {
        window.clearTimeout(handle);
      }
      pending.clear();
    };
  }, []);

  return (
    <ol className={styles.toasts} aria-live="polite">
      {toasts.map((toast) => (
        <li key={toast.id} className={`${styles.toast} ${styles[toast.tone]}`}>
          <span className={styles.mark}>
            <Icon name={toast.mark} size={28} />
          </span>
          <span className={styles.title}>{toast.title}</span>
          {toast.scoreDelta !== null && (
            <span className={styles.delta}>{formatDelta(toast.scoreDelta)}</span>
          )}
          {toast.credibilityDelta !== 0 && (
            <span
              className={styles.cred}
              role="img"
              aria-label={pl.hud.toast.credibility(formatDelta(toast.credibilityDelta))}
            >
              <HudGlyph
                name={toast.credibilityDelta < 0 ? 'shieldCracked' : 'shield'}
                size={18}
                fill={toast.credibilityDelta < 0 ? 'var(--red)' : 'var(--green)'}
              />
              <span aria-hidden>{formatDelta(toast.credibilityDelta)}</span>
            </span>
          )}
          <span className="visually-hidden">„{toast.headline}”</span>
        </li>
      ))}
    </ol>
  );
}
