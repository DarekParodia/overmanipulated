// On-screen touch controls (agents/platforms.md): a floating joystick appears where the thumb
// lands on the movement half; action buttons sit under the other thumb. Mirrored for
// left-handed players.
import { type PointerEvent, useRef, useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
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
          {pl.touch.work}
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
          {pl.touch.interact}
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.ping}`}
          onPointerDown={() => touchInput.pressPing()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {pl.touch.ping}
        </button>
      </div>
    </div>
  );
}
