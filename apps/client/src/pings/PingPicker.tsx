// Ping picker (S2-11): three big speech-bubble buttons in the player's corner. Keys 1–3, arrows /
// d-pad + confirm, or a tap send a ping; Esc / pad east / the ping button again close it.
import { PING_KINDS, type PingKind } from '@redakcja/shared';
import { useEffect } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { NAV_KEYS, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { sendCommand } from '../net/session.ts';
import { isCoarsePointer } from '../scene/quality.ts';
import { KeyCap } from '../stations/kit.tsx';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './PingPicker.module.css';
import {
  choosePing,
  closePingPicker,
  pickerNav,
  pingForKey,
  pressPingAgain,
  setPingSender,
  usePings,
} from './ping-store.ts';

/** Icon per ping: archive (clock = dates), fake (✗), mine (✓). */
const PING_ICON: Record<PingKind, IconName> = {
  needArchive: 'clock',
  fake: 'reject',
  mine: 'publish',
};

function send(ping: PingKind): void {
  emitCue('ping.send');
  sendCommand({ kind: 'ping', ping });
}

export function PingPicker() {
  const open = usePings((s) => s.open);
  useEffect(() => setPingSender(send), []);
  // Never leave a picker open across matches.
  useEffect(() => closePingPicker, []);
  return open ? <PickerBubbles /> : null;
}

function PickerBubbles() {
  const selected = usePings((s) => s.selected);
  const device = useApp((s) => s.inputDevice);
  const leftHanded = useSettings((s) => s.leftHanded);
  const touch = device === 'touch' || isCoarsePointer();

  useInputCapture(true);
  useEffect(() => emitCue('ping.open'), []);

  useNavIntent((intent) => {
    const outcome = pickerNav(usePings.getState().selected, intent);
    switch (outcome.kind) {
      case 'select':
        emitCue('ui.hover');
        usePings.setState({ selected: outcome.index });
        return;
      case 'choose':
        choosePing(outcome.ping, performance.now());
        return;
      case 'again':
        pressPingAgain(performance.now());
        return;
      case 'close':
        emitCue('ui.back');
        closePingPicker();
        return;
      case 'none':
        return;
    }
  });

  // Digits are not navigation intents, and a held Q must not auto-repeat the picker shut:
  // handle keys here before the input manager sees them.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const ping = pingForKey(event.code);
      if (ping) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          useApp.getState().setInputDevice('keyboard');
          choosePing(ping, performance.now());
        }
        return;
      }
      // Tab would map to `alt` (re-send); a held movement key's auto-repeat would spin the
      // highlight. Neither should reach navigation.
      if (event.code === 'Tab' || (event.repeat && event.code in NAV_KEYS)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.code === 'KeyQ') {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) {
          useApp.getState().setInputDevice('keyboard');
          pressPingAgain(performance.now());
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);

  const closeKeys = pl.pings.closeKeys[device];

  return (
    <div
      className={`${styles.picker} ${touch ? styles.touch : ''} ${leftHanded ? styles.mirrored : ''}`}
      role="dialog"
      aria-label={pl.pings.title}
      data-testid="ping-picker"
    >
      <ol className={styles.bubbles}>
        {PING_KINDS.map((ping, index) => (
          <li key={ping}>
            <button
              type="button"
              className={`${styles.bubble} ${styles[ping]} ${index === selected && device !== 'touch' ? styles.selected : ''}`}
              data-testid={`ping-option-${ping}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => choosePing(ping, performance.now())}
            >
              <span className={styles.icon}>
                <Icon name={PING_ICON[ping]} size={26} />
              </span>
              <span className={styles.text}>{pl.vocab.pings[ping]}</span>
              {device === 'keyboard' && (
                <span className={styles.key} aria-hidden="true">
                  <KeyCap>{index + 1}</KeyCap>
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <p className={styles.hint} aria-hidden="true">
        {closeKeys.length > 0 ? (
          <>
            {closeKeys.map((key) => (
              <KeyCap key={key}>{key}</KeyCap>
            ))}
            <span>{pl.pings.close}</span>
          </>
        ) : (
          <span>{pl.pings.closeTouch}</span>
        )}
      </p>
    </div>
  );
}
