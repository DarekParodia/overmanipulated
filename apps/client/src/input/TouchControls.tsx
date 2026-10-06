// On-screen touch controls (agents/platforms.md): a floating joystick appears where the thumb
// lands on the movement half (a faint one rests in the corner to show where); chunky round
// action buttons with an icon and a short label sit under the other thumb. Mirrored for
// left-handed players.
import { type PointerEvent, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { HudGlyph } from '../hud/HudGlyph.tsx';
import { pressPingAgain, usePings } from '../pings/ping-store.ts';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { touchInput } from './input-manager.ts';
import styles from './TouchControls.module.css';
import { JOYSTICK_RADIUS_PX, joystickVector, knobOffset } from './touch.ts';

type Stick = {
  pointerId: number;
  origin: { x: number; y: number };
  knob: { x: number; y: number };
};

export function TouchControls() {
  const leftHanded = useSettings((s) => s.leftHanded);
  const [stick, setStick] = useState<Stick | null>(null);
  const stickRef = useRef<Stick | null>(null);

  function onStickDown(event: PointerEvent<HTMLDivElement>) {
    if (stickRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      knob: { x: 0, y: 0 },
    };
    stickRef.current = next;
    setStick(next);
  }

  function onStickMove(event: PointerEvent<HTMLDivElement>) {
    const current = stickRef.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    const point = { x: event.clientX, y: event.clientY };
    touchInput.setMove(joystickVector(current.origin, point));
    const next = { ...current, knob: knobOffset(current.origin, point) };
    stickRef.current = next;
    setStick(next);
  }

  function onStickUp(event: PointerEvent<HTMLDivElement>) {
    if (stickRef.current?.pointerId !== event.pointerId) {
      return;
    }
    stickRef.current = null;
    setStick(null);
    touchInput.setMove({ x: 0, y: 0 });
  }

  return (
    <div
      className={`${styles.layer} ${leftHanded ? styles.mirrored : ''}`}
      data-testid="touch-controls"
    >
      <div
        className={styles.stickZone}
        aria-label={pl.touch.joystick}
        role="application"
        data-testid="touch-joystick"
        onPointerDown={onStickDown}
        onPointerMove={onStickMove}
        onPointerUp={onStickUp}
        onPointerCancel={onStickUp}
      >
        {!stick && (
          <div className={`${styles.ring} ${styles.idle}`} aria-hidden>
            <div className={styles.knob} />
          </div>
        )}
        {stick && (
          <div
            className={styles.ring}
            style={{
              left: stick.origin.x - JOYSTICK_RADIUS_PX,
              top: stick.origin.y - JOYSTICK_RADIUS_PX,
              width: JOYSTICK_RADIUS_PX * 2,
              height: JOYSTICK_RADIUS_PX * 2,
            }}
          >
            <div
              className={styles.knob}
              style={{ transform: `translate(${stick.knob.x}px, ${stick.knob.y}px)` }}
            />
          </div>
        )}
      </div>
      <div className={styles.buttons}>
        <button
          type="button"
          className={`${styles.action} ${styles.work}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            touchInput.setWork(true);
          }}
          onPointerUp={() => touchInput.setWork(false)}
          onPointerCancel={() => touchInput.setWork(false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <HudGlyph name="work" size={30} fill="var(--surface)" />
          <span className={styles.label}>{pl.touch.work}</span>
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.interact}`}
          onPointerDown={() => {
            emitCue('ui.click');
            touchInput.pressInteract();
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <HudGlyph name="hand" size={30} fill="var(--surface)" />
          <span className={styles.label}>{pl.touch.interact}</span>
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.ping}`}
          data-testid="touch-ping"
          onPointerDown={() => {
            // Open through the input tick like Q; a press while open re-sends or closes.
            if (usePings.getState().open) {
              pressPingAgain(performance.now());
            } else {
              touchInput.pressPing();
            }
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <Icon name="ping" size={24} />
          <span className={styles.label}>{pl.touch.ping}</span>
        </button>
      </div>
    </div>
  );
}
