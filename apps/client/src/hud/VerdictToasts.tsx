// Verdict feedback: a phone-message slip slides in under the folder queue for every verdict and
// expired folder ("Trafny werdykt +30", "Opublikowana fałszywka −20"). At most three at once,
// newest on top; each disappears on its own after a few seconds.

import { useEffect, useRef, useState } from 'react';
import { onGameEvent } from '../net/game-events.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { expiredToast, formatDelta, pushToast, type ToastSlip, verdictToast } from './hud-model.ts';
import { hudStory } from './story-lookup.ts';
import styles from './VerdictToasts.module.css';

const TOAST_MAX = 3;
const TOAST_MS = 3600;

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
      // Slips pushed out of the stack no longer need their timers (the map keeps age order).
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
        <li key={toast.id} className={`${styles.slip} ${styles[toast.tone]}`}>
          <span className={styles.mark}>
            <Icon name={toast.mark} size={20} />
          </span>
          <span className={styles.body}>
            <span className={styles.title}>
              {toast.title}
              {toast.scoreDelta !== null && (
                <span className={styles.delta}> {formatDelta(toast.scoreDelta)}</span>
              )}
            </span>
            <span className={styles.headline}>
              „{toast.headline}”
              {toast.credibilityDelta !== 0 && (
                <span className={styles.cred}>
                  {' · '}
                  {pl.hud.toast.credibility(formatDelta(toast.credibilityDelta))}
                </span>
              )}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
