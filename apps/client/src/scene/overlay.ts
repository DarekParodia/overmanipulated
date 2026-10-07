// DOM overlays over the canvas (signs, name tags): one element with its own React root, created
// in a passive effect and unmounted after React finishes rendering. drei's Html recreates its
// root inside a layout effect when the canvas target settles, which can leave it empty; this
// keeps the root stable for the lifetime of the overlay. Callers move their elements each frame
// with `screenPosition`.
import { useThree } from '@react-three/fiber';
import { type ReactNode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Camera, Vector3 } from 'three';

/** Mounts `node` (memoised by the caller) in a layer over the canvas while the hook lives. */
export function useOverlay(className: string, node: ReactNode): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) {
      return;
    }
    const layer = document.createElement('div');
    layer.className = className;
    parent.appendChild(layer);
    const root = createRoot(layer);
    root.render(node);
    return () => {
      // A root can't be unmounted synchronously while React renders; defer it.
      setTimeout(() => {
        root.unmount();
        layer.remove();
      });
    };
  }, [gl, className, node]);
}

/**
 * CSS transform placing an element's origin at the world point (mutates `point`), or null when
 * the point is behind the camera.
 */
export function screenTransform(
  point: Vector3,
  camera: Camera,
  size: { width: number; height: number },
): string | null {
  point.project(camera);
  if (point.z > 1) {
    return null;
  }
  const x = Math.round(((point.x + 1) / 2) * size.width);
  const y = Math.round(((1 - point.y) / 2) * size.height);
  return `translate3d(${x}px, ${y}px, 0)`;
}
