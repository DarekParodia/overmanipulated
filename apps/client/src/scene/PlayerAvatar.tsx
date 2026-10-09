// Cartoon character (S3-05): a skinned bone rig in the player's colour with a navy outline hull
// and a role accessory (scene/character/rig.ts), animated by an AnimationMixer whose layers follow
// the player's state (idle, walk, run, carry, work) and the feedback triggers (stamp, cheer,
// facepalm, shrug, slump; scene/character/controller.ts). The procedural layer on top adds lean,
// squash & stretch, the spawn pop, a hop and a wobble. A white name pill outlined in the player's
// colour floats above the head.

import { useFrame } from '@react-three/fiber';
import { PLAYER_SPEED_TILES_PER_S, type Role } from '@redakcja/shared';
import { useEffect, useMemo, useRef } from 'react';
import { Frustum, type Group, Matrix4, Sphere, Vector3 } from 'three';
import { animateCharacter, createAnimator } from '../fx/animation/procedural.ts';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { emitCue, feedback } from '../fx/feedback.ts';
import {
  selectCarried,
  selectOperatedDesk,
  selectOperatedStation,
  useGame,
} from '../net/game-store.ts';
import { useSettings } from '../store/settings.ts';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { playerColor, playerColorVar } from '../ui/tokens.ts';
import {
  type CharacterController,
  type CharacterState,
  createCharacterController,
  gestureForTrigger,
  mixerInterval,
} from './character/controller.ts';
import { CHARACTER_HEIGHT, createCharacterRig } from './character/rig.ts';
import { facingToRotationY } from './coords.ts';
import { screenTransform, useOverlay } from './overlay.ts';
import styles from './PlayerAvatar.module.css';
import { useQuality } from './quality.ts';
import { renderState } from './render-state.ts';

/** Height of the name tag's centre above the floor. */
const NAME_TAG_HEIGHT = CHARACTER_HEIGHT + 0.55;
/** Small hop (picking up / putting down a folder): height and duration. */
const HOP_HEIGHT = 0.12;
const HOP_S = 0.26;
/** The procedural lean adds to the clips' own torso lean, so only part of it is applied. */
const LEAN_SHARE = 0.5;
/** Smoothing rate (1/s) of the measured speed. */
const SPEED_SMOOTHING = 10;
/** Radius of the bounding sphere used for the on-screen test. */
const CULL_RADIUS = 1.1;

export type PlayerAvatarProps = {
  id: string;
  nickname: string;
  colorIndex: number;
  role: Role | null;
  shadows: boolean;
};

export function PlayerAvatar({ id, nickname, colorIndex, role, shadows }: PlayerAvatarProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const controller = useRef<CharacterController | null>(null);
  const animator = useMemo(createAnimator, []);
  const pop = useRef<SpringState>({ value: 1, velocity: 0 });
  const wobble = useRef<SpringState>({ value: 0, velocity: 0 });
  const motion = useRef({ hopT: -1, speed: 0, lastX: Number.NaN, lastY: 0, pendingMixer: 0 });
  const scratch = useMemo(
    () => ({
      frustum: new Frustum(),
      matrix: new Matrix4(),
      sphere: new Sphere(new Vector3(), CULL_RADIUS),
      state: { moving: false, speedFraction: 0, carrying: false, working: false } as CharacterState,
    }),
    [],
  );

  // Build the rig for this look; it is added to the body group imperatively.
  useEffect(() => {
    const parent = body.current;
    if (!parent) {
      return;
    }
    const rig = createCharacterRig(playerColor(colorIndex), role, { shadows });
    parent.add(rig.root);
    const ctrl = createCharacterController(rig.root);
    controller.current = ctrl;
    return () => {
      parent.remove(rig.root);
      ctrl.dispose();
      rig.dispose();
      if (controller.current === ctrl) {
        controller.current = null;
      }
    };
  }, [colorIndex, role, shadows]);

  useEffect(
    () =>
      feedback.onAnimation((trigger, context, options) => {
        // Team-wide cues (level win / lose) carry no player: everyone reacts.
        if (context.playerId !== undefined && context.playerId !== id) {
          return;
        }
        const gesture = gestureForTrigger(trigger);
        if (gesture) {
          controller.current?.play(gesture);
          return;
        }
        if (context.playerId === undefined || options.reducedMotion) {
          return;
        }
        if (trigger === 'spawnPop') {
          pop.current.value = 0.2;
          pop.current.velocity = 0;
        } else if (trigger === 'hop' || trigger === 'place') {
          motion.current.hopT = 0;
        } else if (trigger === 'wobble') {
          wobble.current.velocity = 9;
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
        <PlayerMark colorIndex={colorIndex} size={14} />
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

    // Rendered speed (smoothed), for walk vs run.
    const m = motion.current;
    if (delta > 0 && !Number.isNaN(m.lastX)) {
      const step = Math.hypot(player.x - m.lastX, player.y - m.lastY) / delta;
      const measured = Math.min(step, PLAYER_SPEED_TILES_PER_S * 1.2);
      m.speed += (measured - m.speed) * (1 - Math.exp(-SPEED_SMOOTHING * delta));
    }
    m.lastX = player.x;
    m.lastY = player.y;

    const game = useGame.getState();
    const station = selectOperatedStation(game, id);
    const state = scratch.state;
    state.moving = player.moving;
    state.speedFraction = player.moving ? Math.min(1, m.speed / PLAYER_SPEED_TILES_PER_S) : 0;
    state.carrying = selectCarried(game, id) !== undefined;
    state.working =
      (station !== undefined && station.phase !== 'idle' && station.phase !== 'lockout') ||
      selectOperatedDesk(game, id) !== undefined;

    // Animation LOD: off-screen, far away or on the low preset the mixer runs less often.
    scratch.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scratch.frustum.setFromProjectionMatrix(scratch.matrix);
    scratch.sphere.center.set(player.x, 0.7, player.y);
    const onScreen = scratch.frustum.intersectsSphere(scratch.sphere);
    const distance = camera.position.distanceTo(scratch.sphere.center);
    const interval = mixerInterval(useQuality.getState().profile.preset, onScreen, distance);
    m.pendingMixer += delta;
    let mixerDt = 0;
    if (m.pendingMixer >= interval) {
      mixerDt = m.pendingMixer;
      m.pendingMixer = 0;
    }
    controller.current?.update(state, delta, mixerDt);

    // Procedural layer: spawn pop, hop, wobble, lean, squash & stretch.
    stepSpring(pop.current, 1, delta, 3.5, 0.45);
    stepSpring(wobble.current, 0, delta, 3, 0.25);
    let hop = 0;
    if (m.hopT >= 0) {
      m.hopT += delta;
      hop = m.hopT < HOP_S ? Math.sin((Math.PI * m.hopT) / HOP_S) * HOP_HEIGHT : 0;
      if (m.hopT >= HOP_S) {
        m.hopT = -1;
      }
    }
    const popScale = reducedMotion ? 1 : pop.current.value;
    const wobbleAngle = reducedMotion ? 0 : wobble.current.value * 0.25;

    group.position.set(player.x, hop, player.y);
    group.rotation.y = facingToRotationY(player.facing);
    inner.rotation.set(wobbleAngle, 0, -pose.lean * LEAN_SHARE);
    const sideways = 1 / Math.sqrt(pose.squash);
    inner.scale.set(sideways * popScale, pose.squash * popScale, sideways * popScale);
  });

  return (
    <group ref={root} name={`player:${nickname}`}>
      <group ref={body} />
    </group>
  );
}
