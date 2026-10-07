// "Go here" markers for the hint (guidance/next-step.ts): a bouncing yellow arrow with a navy
// outline above each target fixture and a yellow ring on its surface. A small fixed pool, each
// marker three draw calls; no bounce under reduced motion.

import { useFrame } from '@react-three/fiber';
import { fixtureById } from '@redakcja/shared';
import { useRef } from 'react';
import { BackSide, type Group } from 'three';
import { BUSY_KINDS, HERE_KINDS } from '../guidance/next-step.ts';
import { useGuidance } from '../guidance/store.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { surfaceHeight } from './entities.ts';
import { cone, cylinder, merge, mergePainted, ring, useGeometries } from './geometry.ts';

/** Enough for every station of the largest level (six kinds). */
const POOL = 6;
/** Arrow centre height above the fixture surface: the tip stays clear of the station dials. */
const ARROW_LIFT = 1.35;
const BOUNCE_HEIGHT = 0.16;
const BOUNCE_RATE = 5;
const OUTLINE_SCALE = 1.14;

function arrowParts() {
  return [cone(0.32, 0.4, { y: 0.2, rx: Math.PI }), cylinder(0.11, 0.38, { y: 0.56 }, 10)];
}

export function GuidanceMarkers() {
  const roots = useRef<(Group | null)[]>([]);
  const arrows = useRef<(Group | null)[]>([]);
  const g = useGeometries(() => ({
    // Centred, so the outline hull scaled about the origin surrounds it evenly.
    arrow: merge(arrowParts()).center(),
    ring: mergePainted([
      [colors.outline, [ring(0.5, 0.09, { rx: Math.PI / 2 })]],
      [colors.yellow, [ring(0.5, 0.06, { rx: Math.PI / 2, y: 0.03 })]],
    ]),
  }));

  useFrame(({ clock }) => {
    const { step, hintsEnabled } = useGuidance.getState();
    const ended = useGame.getState().levelEnd !== null;
    const ids =
      !hintsEnabled || ended || !step || BUSY_KINDS.has(step.kind) ? [] : step.targetFixtureIds;
    const reducedMotion = useSettings.getState().reducedMotion;
    const bounce = reducedMotion
      ? 0
      : Math.abs(Math.sin(clock.elapsedTime * BOUNCE_RATE)) * BOUNCE_HEIGHT;
    const arrowShown = step !== null && !HERE_KINDS.has(step.kind);
    for (let i = 0; i < POOL; i++) {
      const root = roots.current[i];
      const arrow = arrows.current[i];
      if (!root || !arrow) {
        continue;
      }
      const id = ids[i];
      const fixture = id ? fixtureById(runtime.map, id) : undefined;
      if (!fixture) {
        root.visible = false;
        continue;
      }
      root.visible = true;
      const surface = surfaceHeight(fixture);
      root.position.set(fixture.col + 0.5, surface + 0.02, fixture.row + 0.5);
      arrow.visible = arrowShown;
      arrow.position.y = ARROW_LIFT + bounce;
    }
  });

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pool of identical markers
          key={i}
          name="guidance-marker"
          visible={false}
          ref={(el) => {
            roots.current[i] = el;
          }}
        >
          <mesh geometry={g.ring} renderOrder={1}>
            <meshBasicMaterial vertexColors />
          </mesh>
          <group
            ref={(el) => {
              arrows.current[i] = el;
            }}
          >
            <mesh geometry={g.arrow}>
              <meshLambertMaterial color={colors.yellow} />
            </mesh>
            <mesh geometry={g.arrow} scale={OUTLINE_SCALE}>
              <meshBasicMaterial color={colors.outline} side={BackSide} />
            </mesh>
          </group>
        </group>
      ))}
    </>
  );
}
