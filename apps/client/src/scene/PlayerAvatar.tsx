// Cartoon character (S3-05, S5-02): a skinned bone rig in the player's colour with a navy outline
// hull and a role accessory (scene/character/rig.ts), animated by an AnimationMixer whose layers
// follow the player's state (idle, walk, run, carry, work) and the feedback triggers (stamp,
// cheer, facepalm, shrug, slump; scene/character/controller.ts). On top: role fidgets and
// celebrations, ping emotes (also on remote players), hand IK that holds a carried folder and
// reaches for fixtures, a head that leads turns and looks at the station in use, footsteps timed
// to the foot contacts of the clips, and the procedural layer (lean, squash & stretch, spawn pop,
// hop with landing squash, wobble). A white name pill outlined in the player's colour floats
// above the head.

import { useFrame } from '@react-three/fiber';
import {
  type FolderLocation,
  fixtureById,
  PLAYER_SPEED_TILES_PER_S,
  type Role,
  tileCenter,
} from '@redakcja/shared';
import { useEffect, useMemo, useRef } from 'react';
import { Frustum, type Group, Matrix4, Sphere, Vector3 } from 'three';
import { animateCharacter, createAnimator, landingSquash } from '../fx/animation/procedural.ts';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { emitCue, feedback } from '../fx/feedback.ts';
import { onGameEvent } from '../net/game-events.ts';
import {
  selectCarried,
  selectOperatedDesk,
  selectOperatedStation,
  useGame,
} from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { playerColor, playerColorVar } from '../ui/tokens.ts';
import {
  type CharacterController,
  type CharacterState,
  createCharacterController,
  emoteForPing,
  gestureForTrigger,
  hashString,
  mixerInterval,
} from './character/controller.ts';
import { allowFootstep, createFootstepGate } from './character/footsteps.ts';
import { CARRY_FOLDER_AHEAD, handAnchors, type Vec3, worldToTorso } from './character/hands.ts';
import { BODY_TURN_RATE, headLook, turnTowards } from './character/look.ts';
import { CHARACTER_HEIGHT, type CharacterRig, createCharacterRig } from './character/rig.ts';
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
/** Where the glove centre sits in the hand bone's space (rig.ts: glove under the arm capsule). */
const GLOVE_OFFSET = new Vector3(0, -0.29, 0);
/** Reach target height above the floor (table top) and distance ahead when picking up. */
const REACH_HEIGHT = 0.85;
const REACH_AHEAD = 0.85;

/** Footstep gate shared by all avatars (rate limits are across players). */
const footstepGate = createFootstepGate();

/** Debug (`?debug`): frozen poses for screenshots, by player id. */
const debugControllers = new Map<string, CharacterController>();
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __pose?: unknown }).__pose = (
    id: string,
    clip: string | null,
    time = 0,
  ) => {
    const controller = debugControllers.get(id);
    if (!controller) {
      return false;
    }
    if (clip === null) {
      controller.unfreeze();
    } else {
      controller.seek(clip as never, time);
    }
    return true;
  };
}

/** Starts a two-handed reach for a tile (or, with no target, a spot ahead of the player). */
function reachAt(
  id: string,
  controller: CharacterController | null,
  bodyYaw: number,
  target: { x: number; y: number } | null,
  out: Vec3,
): void {
  const player = renderState.players.get(id);
  if (!controller || !player || Number.isNaN(bodyYaw)) {
    return;
  }
  let dx = target ? target.x - player.x : 0;
  let dz = target ? target.y - player.y : 0;
  if (Math.hypot(dx, dz) < 0.35) {
    dx = Math.cos(player.facing) * REACH_AHEAD;
    dz = Math.sin(player.facing) * REACH_AHEAD;
  }
  controller.reachFor(worldToTorso(dx, dz, REACH_HEIGHT, bodyYaw, out));
}

function fixtureTarget(fixtureId: string): { x: number; y: number } | undefined {
  const fixture = fixtureById(runtime.map, fixtureId);
  return fixture ? tileCenter(fixture.col, fixture.row) : undefined;
}

function locationTarget(location: FolderLocation): { x: number; y: number } | undefined {
  switch (location.kind) {
    case 'fixture':
      return fixtureTarget(location.fixtureId);
    case 'floor':
      return { x: location.x, y: location.y };
    default:
      return undefined;
  }
}

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
  const rigRef = useRef<CharacterRig | null>(null);
  const motion = useRef({
    hopT: -1,
    speed: 0,
    lastX: Number.NaN,
    lastY: 0,
    pendingMixer: 0,
    bodyYaw: Number.NaN,
  });
  const scratch = useMemo(
    () => ({
      frustum: new Frustum(),
      matrix: new Matrix4(),
      sphere: new Sphere(new Vector3(), CULL_RADIUS),
      state: { moving: false, speedFraction: 0, carrying: false, working: false } as CharacterState,
      look: { yaw: 0, pitch: 0 },
      reach: { x: 0, y: 0, z: 0 } as Vec3,
      glove: new Vector3(),
      gloveR: new Vector3(),
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
    const ctrl = createCharacterController(rig.root, { role, seed: hashString(id) });
    controller.current = ctrl;
    rigRef.current = rig;
    debugControllers.set(id, ctrl);
    return () => {
      parent.remove(rig.root);
      ctrl.dispose();
      rig.dispose();
      handAnchors.delete(id);
      if (debugControllers.get(id) === ctrl) {
        debugControllers.delete(id);
      }
      if (controller.current === ctrl) {
        controller.current = null;
        rigRef.current = null;
      }
    };
  }, [colorIndex, role, shadows, id]);

  useEffect(
    () =>
      feedback.onAnimation((trigger, context, options) => {
        // Team-wide cues (level win / lose) carry no player: everyone reacts.
        if (context.playerId !== undefined && context.playerId !== id) {
          return;
        }
        const gesture = gestureForTrigger(trigger, {
          team: context.playerId === undefined,
          role,
        });
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
    [id, role],
  );

  // Ping emotes (visible on remote players too) and hand reaches for pick-up / put-down.
  useEffect(
    () =>
      onGameEvent((event) => {
        if (event.kind === 'ping' && event.playerId === id) {
          controller.current?.playUpper(emoteForPing(event.ping));
        } else if (event.kind === 'folderPickedUp' && event.playerId === id) {
          reachAt(id, controller.current, motion.current.bodyYaw, null, scratch.reach);
        } else if (event.kind === 'folderPutDown' && event.playerId === id) {
          reachAt(
            id,
            controller.current,
            motion.current.bodyYaw,
            locationTarget(event.location) ?? null,
            scratch.reach,
          );
        }
      }),
    [id, scratch],
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
    const desk = selectOperatedDesk(game, id);
    const state = scratch.state;
    state.moving = player.moving;
    state.speedFraction = player.moving ? Math.min(1, m.speed / PLAYER_SPEED_TILES_PER_S) : 0;
    state.carrying = selectCarried(game, id) !== undefined;
    state.working =
      (station !== undefined && station.phase !== 'idle' && station.phase !== 'lockout') ||
      desk !== undefined;
    state.allowFidget = !reducedMotion;

    // Body turns towards the facing a little late; the head leads (or looks at the station).
    const targetYaw = facingToRotationY(player.facing);
    m.bodyYaw =
      Number.isNaN(m.bodyYaw) || reducedMotion
        ? targetYaw
        : turnTowards(m.bodyYaw, targetYaw, delta, BODY_TURN_RATE);
    const interaction = station?.id ?? desk?.id;
    const look = headLook(
      m.bodyYaw,
      player.facing,
      position,
      state.working && interaction ? (fixtureTarget(interaction) ?? null) : null,
      scratch.look,
    );
    state.lookYaw = reducedMotion ? 0 : look.yaw;
    state.lookPitch = reducedMotion ? 0 : look.pitch;

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
    const ctrl = controller.current;
    ctrl?.update(state, delta, mixerDt);

    // Footsteps at the clips' foot contacts: the local player and the nearest others only.
    const contacts = ctrl?.consumeSteps() ?? 0;
    if (contacts > 0 && onScreen) {
      const now = performance.now() / 1000;
      if (
        allowFootstep(
          footstepGate,
          { id, local: player.local, now, x: player.x, y: player.y },
          renderState.players,
        )
      ) {
        emitCue(player.local ? 'player.step' : 'player.stepRemote', { position, playerId: id });
      }
    }

    // Procedural layer: spawn pop, hop, wobble, lean, squash & stretch.
    stepSpring(pop.current, 1, delta, 3.5, 0.45);
    stepSpring(wobble.current, 0, delta, 3, 0.25);
    let hop = 0;
    if (m.hopT >= 0) {
      m.hopT += delta;
      hop = m.hopT < HOP_S ? Math.sin((Math.PI * m.hopT) / HOP_S) * HOP_HEIGHT : 0;
      if (m.hopT >= HOP_S) {
        m.hopT = -1;
        if (!reducedMotion) {
          landingSquash(animator);
        }
      }
    }
    const popScale = reducedMotion ? 1 : pop.current.value;
    const wobbleAngle = reducedMotion ? 0 : wobble.current.value * 0.25;

    group.position.set(player.x, hop, player.y);
    group.rotation.y = m.bodyYaw;
    inner.rotation.set(wobbleAngle, 0, -pose.lean * LEAN_SHARE);
    const sideways = 1 / Math.sqrt(pose.squash);
    inner.scale.set(sideways * popScale, pose.squash * popScale, sideways * popScale);

    // The carried folder follows the gloves.
    const rig = rigRef.current;
    if (rig && state.carrying) {
      group.updateMatrixWorld(true);
      const left = rig.bones.armL.localToWorld(scratch.glove.copy(GLOVE_OFFSET));
      const right = rig.bones.armR.localToWorld(scratch.gloveR.copy(GLOVE_OFFSET));
      const forward = -m.bodyYaw;
      let anchor = handAnchors.get(id);
      if (!anchor) {
        anchor = { x: 0, y: 0, height: 0 };
        handAnchors.set(id, anchor);
      }
      anchor.x = (left.x + right.x) / 2 + Math.cos(forward) * CARRY_FOLDER_AHEAD;
      anchor.y = (left.z + right.z) / 2 + Math.sin(forward) * CARRY_FOLDER_AHEAD;
      anchor.height = (left.y + right.y) / 2;
    } else if (handAnchors.has(id)) {
      handAnchors.delete(id);
    }
  });

  return (
    <group ref={root} name={`player:${nickname}`}>
      <group ref={body} />
    </group>
  );
}
