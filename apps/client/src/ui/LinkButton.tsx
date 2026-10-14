// A link that looks like a Button (ui/Button.tsx): same shapes, colours and press cue, for the few
// places that open a page instead of acting in the game (the privacy note). It opens in the same
// tab: the gamepad presses controls with `click()`, which carries no user activation, so a new
// tab would be swallowed by the popup blocker. Use it only where no room is running (the menu);
// the page it opens links back to the game.
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { emitCue } from '../fx/feedback.ts';
import styles from './Button.module.css';
import type { ButtonVariant } from './Button.tsx';

export type LinkButtonProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'className' | 'target'
> & {
  href: string;
  /** Never 'primary': a link is never the screen's one main action. */
  variant?: Exclude<ButtonVariant, 'primary'>;
  icon?: ReactNode;
};

export function LinkButton({
  href,
  variant = 'ghost',
  icon,
  children,
  onClick,
  ...rest
}: LinkButtonProps) {
  return (
    <a
      {...rest}
      href={href}
      className={`${styles.button} ${styles[variant]}`}
      onClick={(event) => {
        emitCue('ui.click');
        onClick?.(event);
      }}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children && <span className={styles.text}>{children}</span>}
    </a>
  );
}
