// Operator message of the day in the main menu (S7-72): white card with a blue (info) or orange
// (warning) outline and icon, the text and a close button. Never yellow: the menu keeps one
// main action. The close button is not a "back" control, so pad B never dismisses it. The text
// is operator-written Polish from config.json, the one runtime exception to "strings in pl.ts".
import { useRef, useState } from 'react';
import { usePublicConfig } from '../../store/public-config.ts';
import { readStored, writeStored } from '../../store/safe-storage.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Button } from '../../ui/Button.tsx';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './MotdBanner.module.css';
import { MOTD_DISMISSED_KEY, visibleMotd } from './motd-model.ts';

/** Fallback when storage is blocked: the message stays closed until the page reloads. */
let dismissedThisPage: string | null = null;

const NEXT_CONTROL = 'input:not(:disabled), button:not(:disabled)';

export function MotdBanner({ className = '' }: { className?: string | undefined }) {
  const motd = usePublicConfig((s) => s.config.motd);
  const [dismissedId, setDismissedId] = useState(
    () => readStored('local', MOTD_DISMISSED_KEY) ?? dismissedThisPage,
  );
  const bannerRef = useRef<HTMLDivElement>(null);
  const shown = visibleMotd(motd, dismissedId);
  if (!shown) {
    return null;
  }
  const warning = shown.tone === 'warning';

  function dismiss(id: string, closeButton: HTMLButtonElement) {
    // Keyboard and pad users keep a focus: hand it to the next control (the byline field).
    // A tap leaves no visible focus, so a phone does not pop up its keyboard.
    if (closeButton.matches(':focus-visible')) {
      bannerRef.current?.nextElementSibling?.querySelector<HTMLElement>(NEXT_CONTROL)?.focus();
    }
    dismissedThisPage = id;
    writeStored('local', MOTD_DISMISSED_KEY, id);
    setDismissedId(id);
  }

  return (
    <div
      ref={bannerRef}
      role="status"
      aria-label={pl.menu.motdLabel}
      data-testid="motd"
      data-tone={shown.tone}
      className={`${styles.banner} ${warning ? styles.warning : styles.info} ${className}`}
    >
      <span className={styles.icon}>
        <Icon name={warning ? 'siren' : 'lightbulb'} size={28} />
      </span>
      <p className={styles.text}>{typeset(shown.text)}</p>
      <Button
        aria-label={pl.menu.motdClose}
        data-testid="motd-close"
        icon={<Icon name="close" size={24} />}
        onClick={(event) => dismiss(shown.id, event.currentTarget)}
      />
    </div>
  );
}
