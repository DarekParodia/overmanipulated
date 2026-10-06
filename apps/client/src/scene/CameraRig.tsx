// Angled top-down camera. Fits the whole newsroom when tiles would be big enough; on small
// screens it follows the local player at a readable zoom, clamped to the room. Applies shake.
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { type PerspectiveCamera, Vector3 } from 'three';
import { addTrauma, createShake, stepShake } from '../fx/camera/shake.ts';
import { feedback } from '../fx/feedback.ts';
import { runtime } from '../net/session.ts';
import { renderState } from './render-state.ts';

/** Smallest acceptable on-screen tile size in CSS px before switching to follow mode. */
const MIN_TILE_PX = 40;
const FOV = 32;
/** Camera elevation angle above the floor. */
export const ELEVATION = (58 * Math.PI) / 180;
const FOLLOW_SMOOTHING = 6;
/** In follow mode the view may extend this far past the room so HUD plates don't hide players. */
const FOLLOW_EDGE_MARGIN = 1.5;

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const shake = useMemo(createShake, []);
  const focus = useRef(new Vector3(runtime.map.width / 2, 0, runtime.map.height / 2));
  const tmp = useMemo(() => new Vector3(), []);

  useEffect(() => {
    camera.fov = FOV;
    camera.near = 0.5;
    camera.far = 200;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(
    () =>
      feedback.connect({
        addTrauma: (amount) => addTrauma(shake, amount),
        screenX: (position) => {
          tmp.set(position.x, 0.5, position.y).project(camera);
          return tmp.x;
        },
      }),
    [camera, shake, tmp],
  );

  useFrame((_, delta) => {
    const { width, height } = runtime.map;
    // Visible floor needed to show the whole room with a margin, in tiles.
    const fitWidth = width + 1.5;
    const fitDepth = height + 2.5;
    const aspect = size.width / Math.max(1, size.height);
    const tilePxIfFit = Math.min(
      size.width / fitWidth,
      size.height / (fitDepth * Math.sin(ELEVATION)),
    );
    const follow = tilePxIfFit < MIN_TILE_PX && renderState.local !== null;

    let visibleDepth: number;
    const target = tmp;
    if (follow && renderState.local) {
      visibleDepth = size.height / MIN_TILE_PX / Math.sin(ELEVATION);
      const visibleWidth = size.width / MIN_TILE_PX;
      const m = FOLLOW_EDGE_MARGIN;
      const halfW = Math.min(visibleWidth / 2, width / 2 + m);
      const halfD = Math.min(visibleDepth / 2, height / 2 + m);
      target.set(
        Math.min(width + m - halfW, Math.max(halfW - m, renderState.local.x)),
        0,
        Math.min(height + m - halfD, Math.max(halfD - m, renderState.local.y)),
      );
    } else {
      visibleDepth = Math.max(fitDepth, fitWidth / aspect / Math.sin(ELEVATION));
      target.set(width / 2, 0, height / 2 + 0.3);
    }
    const k = 1 - Math.exp(-FOLLOW_SMOOTHING * delta);
    focus.current.lerp(target, k);

    const vertical = visibleDepth * Math.sin(ELEVATION);
    const distance = vertical / 2 / Math.tan((FOV * Math.PI) / 360);
    const offset = stepShake(shake, delta);
    camera.position.set(
      focus.current.x + offset.x,
      Math.sin(ELEVATION) * distance,
      focus.current.z + Math.cos(ELEVATION) * distance + offset.y,
    );
    camera.lookAt(focus.current.x + offset.x, 0, focus.current.z + offset.y);
    camera.rotation.z += offset.roll;
  });

  return null;
}
