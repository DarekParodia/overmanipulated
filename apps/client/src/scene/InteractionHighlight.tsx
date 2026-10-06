// Shows what the local player would interact with: a thick yellow rounded frame with a navy
// outline around the target fixture, at its surface height (yellow = "do this next",
// design-rules §3). It pops onto a new target with a small overshoot (a cut under reduced
// motion). One draw call.

import { useFrame } from '@react-three/fiber';
import { findInteractionTarget } from '@redakcja/shared';
import { useRef } from 'react';
import { type Group, Path, Shape, ShapeGeometry } from 'three';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { surfaceHeight } from './entities.ts';
import { mergePainted, useGeometries } from './geometry.ts';
import { renderState } from './render-state.ts';

/** Half the frame's outer size: a little larger than a tile so it hugs the prop. */
const HALF = 0.62;
/** Width of the yellow band and of the navy outline on each side of it. */
const BAND = 0.1;
const OUTLINE = 0.035;
const LIFT = 0.03;

/** The fixture id the local player currently targets (read by other scene components). */
export const highlightState = { targetId: null as string | null };

function roundedRect(target: Path, half: number, radius: number): void {
  target.moveTo(-half + radius, -half);
  target.lineTo(half - radius, -half);
  target.quadraticCurveTo(half, -half, half, -half + radius);
  target.lineTo(half, half - radius);
  target.quadraticCurveTo(half, half, half - radius, half);
  target.lineTo(-half + radius, half);
  target.quadraticCurveTo(-half, half, -half, half - radius);
  target.lineTo(-half, -half + radius);
  target.quadraticCurveTo(-half, -half, -half + radius, -half);
}

/** Flat rounded-square frame between two half sizes, lying on the xz plane at height y. */
function frame(outer: number, inner: number, y: number): ShapeGeometry {
  const shape = new Shape();
  roundedRect(shape, outer, 0.16);
  const hole = new Path();
  roundedRect(hole, inner, 0.1);
  shape.holes.push(hole);
  const geometry = new ShapeGeometry(shape, 4);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

export function InteractionHighlight() {
  const root = useRef<Group>(null);
  const pop = useRef<SpringState>({ value: 1, velocity: 0 });
  const g = useGeometries(() => ({
    frame: mergePainted([
      [colors.outline, [frame(HALF + OUTLINE, HALF - BAND - OUTLINE, 0)]],
      [colors.yellow, [frame(HALF, HALF - BAND, 0.004)]],
    ]),
  }));

  useFrame((_, delta) => {
    const group = root.current;
    if (!group) {
      return;
    }
    let local: { x: number; y: number; facing: number } | undefined;
    for (const player of renderState.players.values()) {
      if (player.local) {
        local = player;
      }
    }
    const target = local ? findInteractionTarget(runtime.map, local, local.facing) : undefined;
    const reducedMotion = useSettings.getState().reducedMotion;
    if (!target) {
      highlightState.targetId = null;
      group.visible = false;
      return;
    }
    if (target.id !== highlightState.targetId) {
      highlightState.targetId = target.id;
      pop.current.value = reducedMotion ? 1 : 1.2;
      pop.current.velocity = 0;
    }
    stepSpring(pop.current, 1, delta, 4, 0.45);
    group.visible = true;
    group.position.set(target.col + 0.5, surfaceHeight(target) + LIFT, target.row + 0.5);
    group.scale.setScalar(reducedMotion ? 1 : pop.current.value);
  });

  return (
    <group ref={root} name="interaction-highlight" visible={false}>
      <mesh geometry={g.frame}>
        <meshBasicMaterial vertexColors />
      </mesh>
    </group>
  );
}
