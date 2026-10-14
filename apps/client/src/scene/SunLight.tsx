// The sun over the newsroom: a directional light aimed at the room centre whose shadow box is
// fitted to the current map (scene/sun.ts). Mounted inside the per-level group, so a level with
// another map gets a new frame and a fresh shadow map.
import { useMemo } from 'react';
import { Object3D } from 'three';
import { useGameView } from '../net/view-context.tsx';
import { colors } from '../ui/tokens.ts';
import { sunFrame } from './sun.ts';

const SUN_INTENSITY = 1.5;
/** Shadow map edge in texels: about 0.03 tiles per texel on the biggest (24x14) room. */
const SHADOW_MAP_SIZE = 1024;

export function SunLight({ shadows }: { shadows: boolean }) {
  const view = useGameView();
  const frame = useMemo(() => sunFrame(view.runtime.map.width, view.runtime.map.height), [view]);
  // The light aims at its target's world position, so the target has to live in the scene.
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(...frame.target);
    return object;
  }, [frame]);
  return (
    <>
      <primitive object={target} />
      {/* The bounds are fixed for the light's lifetime; three builds the shadow projection from
          them when it allocates the shadow map. */}
      <directionalLight
        position={frame.position}
        target={target}
        intensity={SUN_INTENSITY}
        color={colors.surface}
        castShadow={shadows}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-left={-frame.half.x}
        shadow-camera-right={frame.half.x}
        shadow-camera-top={frame.half.y}
        shadow-camera-bottom={-frame.half.y}
      />
    </>
  );
}
