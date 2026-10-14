// Angled top-down camera. Fits the whole newsroom when tiles would be big enough; on small
// screens it follows the local player at a readable zoom, clamped to the room and framed under
// the HUD band (scene/camera-framing.ts). Applies the GameView's shake and hit punch, fed by the
// view's own feedback (S7-85). A spectator view (S7-90) fits its whole newsroom under the team
// plate unless it follows a player, and never shakes.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import { stepPunch } from '../fx/camera/punch.ts';
import { stepShake } from '../fx/camera/shake.ts';
import { hitCamera, settleCamera } from '../fx/camera/view-camera.ts';
import { fxTimeScale } from '../fx/time-scale.ts';
import { useHudBand } from '../hud/hud-band.ts';
import { useGameView } from '../net/view-context.tsx';
import {
  computeFraming,
  FIT_BACK_ROOM,
  placeCamera,
  SPECTATOR_FIT_BACK_ROOM,
  setUpLens,
} from './camera-framing.ts';

const FOLLOW_SMOOTHING = 6;

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const view = useGameView();
  const focus = useRef(new Vector3(view.runtime.map.width / 2, 0, view.runtime.map.height / 2));
  const tmp = useMemo(() => new Vector3(), []);

  // A rig starts calm, whatever the view's camera went through before it mounted.
  useEffect(() => settleCamera(view.camera), [view]);

  useEffect(() => {
    setUpLens(camera);
    // Leave no offset behind for whatever renders with this camera next.
    return () => camera.clearViewOffset();
  }, [camera]);

  useEffect(
    () =>
      view.feedback.connect({
        // A spectator watches calmly: no camera shake (S7-90).
        ...(view.kind !== 'spectator'
          ? { addTrauma: (amount: number) => hitCamera(view.camera, amount) }
          : {}),
        screenX: (position) => {
          tmp.set(position.x, 0.5, position.y).project(camera);
          return tmp.x;
        },
      }),
    [view, camera, tmp],
  );

  useFrame((_, delta) => {
    const framing = computeFraming({
      width: size.width,
      height: size.height,
      mapW: view.runtime.map.width,
      mapH: view.runtime.map.height,
      local: view.render.local,
      // Only a player has the HUD over the scene: the intro's stage (S7-101) and a spectator view
      // (S7-90) start right under their own frame.
      topInsetPx: view.kind === 'player' ? useHudBand.getState().px : 0,
      backRoom: view.kind === 'spectator' ? SPECTATOR_FIT_BACK_ROOM : FIT_BACK_ROOM,
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
      stepPunch(view.camera.punch, fxDelta),
      stepShake(view.camera.shake, fxDelta),
    );
  });

  return null;
}
