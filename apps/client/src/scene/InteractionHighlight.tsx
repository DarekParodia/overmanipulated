// Shows what the local player would interact with: corner marks in ink on a paper strip around
// the target fixture, at its surface height. They snap to a new target with a small overshoot (a cut
// under reduced motion). No glow, no pulsing.

import { useFrame } from '@react-three/fiber';
import { findInteractionTarget } from '@redakcja/shared';
import { useRef } from 'react';
import type { Group } from 'three';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { palette } from '../ui/tokens.ts';
import { surfaceHeight } from './entities.ts';
import { box, merge, useGeometries } from './geometry.ts';
import { renderState } from './render-state.ts';

/** Half the corner-mark square, slightly larger than a tile. */
const HALF = 0.56;
const ARM = 0.2;
const WIDTH = 0.04;
const THICKNESS = 0.012;
const LIFT = 0.03;

/** The fixture id the local player currently targets (read by other scene components). */
export const highlightState = { targetId: null as string | null };

function cornerMarks(width: number, arm: number, y: number) {
  const parts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * HALF;
      const cz = sz * HALF;
      parts.push(box(arm, THICKNESS, width, { x: cx - (sx * (arm - width)) / 2, y, z: cz }));
      parts.push(box(width, THICKNESS, arm, { x: cx, y, z: cz - (sz * (arm - width)) / 2 }));
    }
  }
  return merge(parts);
}

export function InteractionHighlight() {
  const root = useRef<Group>(null);
  const pop = useRef<SpringState>({ value: 1, velocity: 0 });
  const g = useGeometries(() => ({
    // Ink corner marks on a slightly wider paper strip, so they read on the dark belt too.
    marks: cornerMarks(WIDTH, ARM, 0),
    backing: cornerMarks(WIDTH + 0.035, ARM + 0.035, -THICKNESS),
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
      pop.current.value = reducedMotion ? 1 : 1.18;
      pop.current.velocity = 0;
    }
    stepSpring(pop.current, 1, delta, 4, 0.45);
    group.visible = true;
    group.position.set(target.col + 0.5, surfaceHeight(target) + LIFT, target.row + 0.5);
    group.scale.setScalar(reducedMotion ? 1 : pop.current.value);
  });

  return (
    <group ref={root} name="interaction-highlight" visible={false}>
      <mesh geometry={g.backing}>
        <meshLambertMaterial color={palette.paper} />
      </mesh>
      <mesh geometry={g.marks}>
        <meshLambertMaterial color={palette.ink} />
      </mesh>
    </group>
  );
}
