// Chunky cartoon buttons (design-rules.md): thick outline, hard drop shadow that collapses when
// pressed, one colour per meaning. Every press emits a UI cue.
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from 'react';
import { emitCue } from '../fx/feedback.ts';
import styles from './Button.module.css';

export type ButtonVariant =
  /** Yellow: the one thing to do next on this screen. */
  | 'primary'
  /** White: everything else. */
  | 'secondary'
  /** Meaning colours: publish/ready (green), reject/danger (red), context/warning (orange). */
  | 'green'
  | 'red'
  | 'orange'
  /** Text-only, for minor actions. */
  | 'ghost';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  /** Use the "back" sound (leave, close, cancel). */
  back?: boolean;
  wide?: boolean;
  /** Bigger text and padding for the main call to action. */
  big?: boolean;
};

export function Button({
  variant = 'secondary',
  icon,
  back = false,
  wide = false,
  big = false,
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
      data-nav-back={back || undefined}
      className={`${styles.button} ${styles[variant]} ${wide ? styles.wide : ''} ${big ? styles.big : ''}`}
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
