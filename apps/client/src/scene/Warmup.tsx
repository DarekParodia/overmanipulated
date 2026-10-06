// Compiles every material in the scene once after mount. Without this, the first particle burst
// (or any first-time material) compiles its shader mid-game, which stalls a frame for 100+ ms on
// integrated GPUs and phones — right when the player starts moving.
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    gl.compile(scene, camera);
  }, [gl, scene, camera]);
  return null;
}
