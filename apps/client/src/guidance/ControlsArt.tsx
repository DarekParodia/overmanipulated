// Drawn controls shared by the first-game tutorial, the station help card and the intro: key caps,
// gamepad buttons, the d-pad, touch thumb-button labels and the tutorial's step drawings. They
// are pictures, not inputs, so screen readers skip them where the text next to them says it all.
import { abilityOf, type Role } from '@redakcja/shared';
import type { ReactNode } from 'react';
import { abilityKeyCap } from '../screens/settings-model.ts';
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { RoleIcon } from '../ui/icons/RoleIcon.tsx';
import styles from './ControlsArt.module.css';
import type { TutorialStepId } from './tutorial.ts';

/** `sm`: the small inline size used in notes such as the tutorial's "or Esc". */
export type ControlSize = 'md' | 'sm';

/** A drawn key cap. */
export function Key({
  children,
  wide = false,
  size = 'md',
}: {
  children: ReactNode;
  wide?: boolean;
  size?: ControlSize;
}) {
  return (
    <span
      className={`${styles.key} ${wide ? styles.keyWide : ''} ${size === 'sm' ? styles.small : ''}`}
    >
      {children}
    </span>
  );
}

/** A drawn round gamepad face button. */
export function PadButton({ children, size = 'md' }: { children: ReactNode; size?: ControlSize }) {
  return (
    <span className={`${styles.padButton} ${size === 'sm' ? styles.small : ''}`}>{children}</span>
  );
}

/** A drawn touch thumb button: a pill so long Polish words fit. */
export function TouchButton({ children }: { children: ReactNode }) {
  return <span className={styles.touchButton}>{children}</span>;
}

/** A drawn gamepad d-pad (the „Krzyżak”). */
export function DPad() {
  return (
    <svg className={styles.dpad} viewBox="0 0 48 48" aria-hidden="true">
      <path
        className={styles.dpadShape}
        d="M18 4h12a2 2 0 0 1 2 2v12h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H32v12a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V30H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h12V6a2 2 0 0 1 2-2z"
      />
      <circle className={styles.dpadDot} cx="24" cy="24" r="3" />
    </svg>
  );
}

/** The control to press, drawn the way the player sees it on their device. */
export function Control({ action, device }: { action: 'interact' | 'work'; device: InputDevice }) {
  if (device === 'gamepad') {
    return <PadButton>{action === 'interact' ? 'A' : 'X'}</PadButton>;
  }
  if (device === 'touch') {
    return <TouchButton>{action === 'interact' ? pl.touch.interact : pl.touch.work}</TouchButton>;
  }
  return action === 'interact' ? <Key>E</Key> : <Key wide>{pl.settings.keySpace}</Key>;
}

/** The role ability's control: R, RB or the fourth thumb button with its own label. */
export function AbilityControl({ role, device }: { role: Role | null; device: InputDevice }) {
  const ability = abilityOf(role);
  if (device === 'touch') {
    return (
      <TouchButton>{ability ? pl.touch.ability[ability] : pl.touch.abilityGeneric}</TouchButton>
    );
  }
  if (device === 'gamepad') {
    return <PadButton>{abilityKeyCap('gamepad')}</PadButton>;
  }
  return <Key>{abilityKeyCap('keyboard')}</Key>;
}

/** The drawing for one tutorial step (or the closing "well done" card). */
export function Illustration({
  id,
  device,
  role = null,
}: {
  id: TutorialStepId | 'done';
  device: InputDevice;
  /** The local player's role: the ability step draws its icon. */
  role?: Role | null;
}) {
  switch (id) {
    case 'move':
      if (device === 'keyboard') {
        return (
          <span className={styles.wasd}>
            <Key>W</Key>
            <span className={styles.wasdRow}>
              <Key>A</Key>
              <Key>S</Key>
              <Key>D</Key>
            </span>
          </span>
        );
      }
      return (
        <span className={styles.stick}>
          <span className={styles.stickKnob} />
        </span>
      );
    case 'pickup':
      return (
        <span className={styles.pair}>
          <Icon name="article" size={40} />
          <Control action="interact" device={device} />
        </span>
      );
    case 'work':
      return (
        <span className={styles.pair}>
          <Icon name="clock" size={40} />
          <Control action="work" device={device} />
        </span>
      );
    case 'minigame':
      return (
        <span className={styles.pair}>
          <Icon name="photo" size={44} />
        </span>
      );
    case 'verdict':
      return (
        <span className={styles.verdicts}>
          <span className={`${styles.verdict} ${styles.publish}`}>
            <Icon name="publish" size={30} />
          </span>
          <span className={`${styles.verdict} ${styles.context}`}>
            <Icon name="publishWithContext" size={30} />
          </span>
          <span className={`${styles.verdict} ${styles.reject}`}>
            <Icon name="reject" size={30} />
          </span>
        </span>
      );
    case 'ability':
      return (
        <span className={styles.pair}>
          {role !== null && <RoleIcon role={role} size={40} />}
          <AbilityControl role={role} device={device} />
        </span>
      );
    case 'done':
      return (
        <span className={`${styles.verdict} ${styles.publish} ${styles.doneMark}`}>
          <Icon name="publish" size={44} />
        </span>
      );
  }
}

/** Gamepad key names drawn as a d-pad instead of a round button. */
const DPAD_NAMES: ReadonlySet<string> = new Set([pl.settings.padDpad]);
/** Keyboard key names short enough for a square cap; longer ones get a wide cap. */
const SQUARE_KEY_MAX_CHARS = 2;

/**
 * One named control from a key hint (`pl.minigames.*.keys`), drawn for the device: a key cap,
 * a pad button (the d-pad for „Krzyżak”) or a touch gesture / button label.
 */
export function NamedControl({ name, device }: { name: string; device: InputDevice }) {
  if (device === 'touch') {
    return <TouchButton>{name}</TouchButton>;
  }
  if (device === 'gamepad') {
    return DPAD_NAMES.has(name) ? <DPad /> : <PadButton>{name}</PadButton>;
  }
  return <Key wide={name.length > SQUARE_KEY_MAX_CHARS}>{name}</Key>;
}
