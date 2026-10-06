// Greybox character: faceted capsule in the player's colour with a paper notepad showing which
// way they face, a typed name strip, and procedural animation (bob, lean, squash, spawn pop).
// While carrying a folder the arms swing forward to hold it and the notepad is put away.
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import { animateCharacter, createAnimator } from '../fx/animation/procedural.ts';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { emitCue, feedback } from '../fx/feedback.ts';
import { selectCarried, useGame } from '../net/game-store.ts';
import { useSettings } from '../store/settings.ts';
import { palette, playerColor } from '../ui/tokens.ts';
import { facingToRotationY } from './coords.ts';
import { box, merge } from './geometry.ts';
import styles from './PlayerAvatar.module.css';
import { renderState } from './render-state.ts';

/** Arm swing about the shoulder: hanging (slightly forward) and holding a folder at the chest. */
const ARM_REST = 0.15;
const ARM_CARRY = 1.7;

/** Two arms hanging from the shoulder line (shared by every avatar). */
const armsGeometry = merge([
  box(0.1, 0.32, 0.1, { y: -0.16, z: 0.3 }),
  box(0.1, 0.32, 0.1, { y: -0.16, z: -0.3 }),
]);

export type PlayerAvatarProps = {
  id: string;
  nickname: string;
  colorIndex: number;
  shadows: boolean;
};

export function PlayerAvatar({ id, nickname, colorIndex, shadows }: PlayerAvatarProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const animator = useMemo(createAnimator, []);
  const pop = useRef<SpringState>({ value: 1, velocity: 0 });
  const carry = useRef<SpringState>({ value: 0, velocity: 0 });
  const arms = useRef<Group>(null);
  const notepad = useRef<Mesh>(null);
  const color = playerColor(colorIndex);

  useEffect(
    () =>
      feedback.onAnimation((trigger, context) => {
        if (trigger === 'spawnPop' && context.playerId === id) {
          pop.current.value = 0.2;
          pop.current.velocity = 0;
        }
      }),
    [id],
  );

  useFrame((_, delta) => {
    const player = renderState.players.get(id);
    const group = root.current;
    const inner = body.current;
    if (!group || !inner) {
      return;
    }
    group.visible = player !== undefined;
    if (!player) {
      return;
    }
    const reducedMotion = useSettings.getState().reducedMotion;
    const { pose, events } = animateCharacter(animator, player.moving, delta, reducedMotion);
    const position = { x: player.x, y: player.y };
    if (events.started) {
      emitCue('player.start', { position, playerId: id });
    }
    if (events.footstep) {
      emitCue(player.local ? 'player.step' : 'player.stepRemote', { position, playerId: id });
    }

    stepSpring(pop.current, 1, delta, 3.5, 0.45);
    const popScale = reducedMotion ? 1 : pop.current.value;

    const carrying = selectCarried(useGame.getState(), id) !== undefined;
    stepSpring(carry.current, carrying ? 1 : 0, delta, 5, 0.6);
    const amount = reducedMotion ? (carrying ? 1 : 0) : carry.current.value;
    const swing = ARM_REST + (ARM_CARRY - ARM_REST) * amount;
    if (arms.current) {
      arms.current.rotation.z = swing;
    }
    if (notepad.current) {
      notepad.current.visible = amount < 0.5;
    }

    group.position.set(player.x, pose.bob, player.y);
    group.rotation.y = facingToRotationY(player.facing);
    inner.rotation.z = -pose.lean;
    const sideways = 1 / Math.sqrt(pose.squash);
    inner.scale.set(sideways * popScale, pose.squash * popScale, sideways * popScale);
  });

  return (
    <group ref={root} name={`player:${nickname}`}>
      <group ref={body}>
        <mesh position={[0, 0.52, 0]} castShadow={shadows}>
          <capsuleGeometry args={[0.27, 0.48, 2, 7]} />
          <meshLambertMaterial color={color} flatShading />
        </mesh>
        {/* Notepad held in front: shows facing direction. */}
        <mesh
          ref={notepad}
          position={[0.27, 0.55, 0]}
          rotation={[0, 0, -0.25]}
          castShadow={shadows}
        >
          <boxGeometry args={[0.06, 0.26, 0.2]} />
          <meshLambertMaterial color={palette.paper} />
        </mesh>
        {/* Both arms in one mesh, pivoting at the shoulder line; +z swings them forward (+x). */}
        <group ref={arms} position={[0.02, 0.72, 0]}>
          <mesh geometry={armsGeometry} castShadow={shadows}>
            <meshLambertMaterial color={color} flatShading />
          </mesh>
        </group>
        {/* Eyes, so the face reads from the top-down camera. */}
        <mesh position={[0.22, 0.86, 0.08]}>
          <boxGeometry args={[0.04, 0.06, 0.04]} />
          <meshLambertMaterial color={palette.ink} />
        </mesh>
        <mesh position={[0.22, 0.86, -0.08]}>
          <boxGeometry args={[0.04, 0.06, 0.04]} />
          <meshLambertMaterial color={palette.ink} />
        </mesh>
      </group>
      <Html position={[0, 1.35, 0]} center zIndexRange={[10, 0]} className={styles.labelWrap}>
        <span className={styles.label} style={{ borderColor: color }}>
          {nickname}
        </span>
      </Html>
    </group>
  );
}
