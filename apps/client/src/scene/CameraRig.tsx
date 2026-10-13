// Angled top-down camera. Fits the whole newsroom when tiles would be big enough; on small
// screens it follows the local player at a readable zoom, clamped to the room and framed under
// the HUD band (scene/camera-framing.ts). Applies shake and the hit punch.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import { addPunch, createPunch, stepPunch } from '../fx/camera/punch.ts';
import { addTrauma, createShake, stepShake } from '../fx/camera/shake.ts';
import { feedback } from '../fx/feedback.ts';
import { fxTimeScale } from '../fx/time-scale.ts';
import { useHudBand } from '../hud/hud-band.ts';
import { runtime } from '../net/session.ts';
import { computeFraming, placeCamera, setUpLens } from './camera-framing.ts';
import { renderState } from './render-state.ts';

const FOLLOW_SMOOTHING = 6;

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const shake = useMemo(createShake, []);
  const punch = useMemo(createPunch, []);
  const focus = useRef(new Vector3(runtime.map.width / 2, 0, runtime.map.height / 2));
  const tmp = useMemo(() => new Vector3(), []);

  useEffect(() => {
    setUpLens(camera);
    // Leave no offset behind for whatever renders with this camera next.
    return () => camera.clearViewOffset();
  }, [camera]);

  useEffect(
    () =>
      feedback.connect({
        addTrauma: (amount) => {
          addTrauma(shake, amount);
          addPunch(punch, amount);
        },
        screenX: (position) => {
          tmp.set(position.x, 0.5, position.y).project(camera);
          return tmp.x;
        },
      }),
    [camera, shake, punch, tmp],
  );

  useFrame((_, delta) => {
    const framing = computeFraming({
      width: size.width,
      height: size.height,
      mapW: runtime.map.width,
      mapH: runtime.map.height,
      local: renderState.local,
      topInsetPx: useHudBand.getState().px,
    });
    const k = 1 - Math.exp(-FOLLOW_SMOOTHING * delta);
    focus.current.lerp(tmp.set(framing.target.x, 0, framing.target.z), k);
    // Hit-stop freezes the shake and the punch recovery too, so a slam holds for a beat.
    const fxDelta = delta * fxTimeScale();
    placeCamera(
      camera,
      focus.current,
      framing,
      size,
      stepPunch(punch, fxDelta),
      stepShake(shake, fxDelta),
    );
  });

  return null;
}
