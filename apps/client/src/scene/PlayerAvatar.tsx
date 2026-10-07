// Cartoon character: a round faceted capsule in the player's colour with a navy outline (an
// inverted hull, one extra draw call), big eyes and a white notepad showing which way they face,
// a white name pill outlined in the player's colour, and procedural animation (bob, lean,
// squash, spawn pop). While carrying a folder the arms swing forward to hold it and the notepad
// is put away.
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BackSide, CapsuleGeometry, type Group, type Mesh, Vector3 } from 'three';
import { animateCharacter, createAnimator } from '../fx/animation/procedural.ts';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { emitCue, feedback } from '../fx/feedback.ts';
import { selectCarried, useGame } from '../net/game-store.ts';
import { useSettings } from '../store/settings.ts';
import { colors, playerColor, playerColorVar } from '../ui/tokens.ts';
import { facingToRotationY } from './coords.ts';
import { box, merge, mergePainted } from './geometry.ts';
import { screenTransform, useOverlay } from './overlay.ts';
import styles from './PlayerAvatar.module.css';
import { renderState } from './render-state.ts';

/** Arm swing about the shoulder: hanging (slightly forward) and holding a folder at the chest. */
const ARM_REST = 0.15;
const ARM_CARRY = 1.7;

/** Round body shared by every avatar; the outline hull is the same mesh scaled up. */
const bodyGeometry = new CapsuleGeometry(0.33, 0.32, 3, 10);
const OUTLINE_SCALE = 1.16;
/** Height of the name tag's centre above the floor. */
const NAME_TAG_HEIGHT = 1.35;

/** Two arms hanging from the shoulder line (shared by every avatar). */
const armsGeometry = merge([
  box(0.12, 0.32, 0.12, { y: -0.16, z: 0.33 }),
  box(0.12, 0.32, 0.12, { y: -0.16, z: -0.33 }),
]);

/** Big cartoon eyes: white with navy pupils, merged into one vertex-coloured mesh. */
const eyesGeometry = mergePainted([
  [
    colors.surface,
    [
      box(0.05, 0.13, 0.11, { x: 0.29, y: 0.86, z: 0.1 }),
      box(0.05, 0.13, 0.11, { x: 0.29, y: 0.86, z: -0.1 }),
    ],
  ],
  [
    colors.outline,
    [
      box(0.03, 0.07, 0.06, { x: 0.32, y: 0.85, z: 0.1 }),
      box(0.03, 0.07, 0.06, { x: 0.32, y: 0.85, z: -0.1 }),
    ],
  ],
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

  // Name tag in a DOM layer over the canvas, moved to the head every frame.
  const tag = useRef<HTMLSpanElement | null>(null);
  const tagAt = useRef('');
  const tagPoint = useMemo(() => new Vector3(), []);
  const tagNode = useMemo(
    () => (
      <span
        ref={(element) => {
          tag.current = element;
          tagAt.current = '';
          // The old overlay root unmounts after the new one mounts: only clear our own element.
          return () => {
            if (tag.current === element) {
              tag.current = null;
            }
          };
        }}
        className={styles.label}
        style={{ borderColor: playerColorVar(colorIndex) }}
      >
        {nickname}
      </span>
    ),
    [nickname, colorIndex],
  );
  useOverlay(styles.labelLayer ?? '', tagNode);

  useFrame(({ camera, size }, delta) => {
    const player = renderState.players.get(id);
    const group = root.current;
    const inner = body.current;
    if (!group || !inner) {
      return;
    }
    group.visible = player !== undefined;
    if (tag.current) {
      const at = player
        ? (screenTransform(tagPoint.set(player.x, NAME_TAG_HEIGHT, player.y), camera, size) ??
          'scale(0)')
        : 'scale(0)';
      if (at !== tagAt.current) {
        tagAt.current = at;
        tag.current.style.transform = `${at} translate(-50%, -50%)`;
      }
    }
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
        <mesh geometry={bodyGeometry} position={[0, 0.55, 0]} castShadow={shadows}>
          <meshLambertMaterial color={color} flatShading />
        </mesh>
        {/* Inverted hull: back faces of a slightly larger body read as a thick navy outline. */}
        <mesh
          geometry={bodyGeometry}
          position={[0, 0.55, 0]}
          scale={OUTLINE_SCALE}
          name="avatar-outline"
        >
          <meshBasicMaterial color={colors.outline} side={BackSide} />
        </mesh>
        {/* Notepad held in front: shows facing direction. */}
        <mesh
          ref={notepad}
          position={[0.33, 0.55, 0]}
          rotation={[0, 0, -0.25]}
          castShadow={shadows}
        >
          <boxGeometry args={[0.06, 0.26, 0.2]} />
          <meshLambertMaterial color={colors.surface} />
        </mesh>
        {/* Both arms in one mesh, pivoting at the shoulder line; +z swings them forward (+x). */}
        <group ref={arms} position={[0.02, 0.72, 0]}>
          <mesh geometry={armsGeometry} castShadow={shadows}>
            <meshLambertMaterial color={color} flatShading />
          </mesh>
        </group>
        {/* Eyes, so the face reads from the top-down camera. */}
        <mesh geometry={eyesGeometry}>
          <meshBasicMaterial vertexColors />
        </mesh>
      </group>
    </group>
  );
}
