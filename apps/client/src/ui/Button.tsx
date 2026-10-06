// Buttons imitate physical newsroom objects (design-rules §1): a typewriter key, a rubber
// stamp label, or a manila folder tab. Every press emits a UI cue.
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from 'react';
import { emitCue } from '../fx/feedback.ts';
import styles from './Button.module.css';

export type ButtonVariant = 'key' | 'stamp' | 'tab' | 'quiet';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** Use the "back" sound (leave, close, cancel). */
  back?: boolean;
  wide?: boolean;
};

export function Button({
  variant = 'key',
  icon,
  back = false,
  wide = false,
  children,
  onClick,
  onPointerEnter,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`${styles.button} ${styles[variant]} ${wide ? styles.wide : ''}`}
      onClick={(event) => {
        emitCue(back ? 'ui.back' : 'ui.click');
        onClick?.(event);
      }}
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'mouse' && !rest.disabled) {
          emitCue('ui.hover');
        }
        onPointerEnter?.(event);
      }}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children && <span className={styles.text}>{children}</span>}
    </button>
  );
}
