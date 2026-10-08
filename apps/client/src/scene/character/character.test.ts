import { describe, expect, it } from 'bun:test';
import { roleSchema } from '@redakcja/shared';
import { BASE_CLIPS, characterClips, GESTURE_CLIPS } from './clips.ts';
import {
  createCharacterController,
  GESTURE_FADE_IN_S,
  gestureForTrigger,
  gestureWeight,
  LOD_FAR_DISTANCE,
  mixerInterval,
  strideRate,
  targetBaseWeights,
} from './controller.ts';
import {
  BONE_NAMES,
  BONE_REST,
  boneRestWorld,
  buildCharacterGeometry,
  CHARACTER_HEIGHT,
  createCharacterRig,
} from './rig.ts';

const idle = { moving: false, speedFraction: 0, carrying: false, working: false };

describe('character rig', () => {
  it('chains bone rest offsets into world positions', () => {
    const head = boneRestWorld('head');
    expect(head[1]).toBeCloseTo(BONE_REST.hips[1] + BONE_REST.torso[1] + BONE_REST.head[1]);
    expect(boneRestWorld('armL')[2]).toBeGreaterThan(0);
    expect(boneRestWorld('armR')[2]).toBeLessThan(0);
  });

  it('builds one skinned body and one outline hull for every role', () => {
    for (const role of [null, ...roleSchema.options]) {
      const { body, outline } = buildCharacterGeometry('#ff8c42', role);
      for (const geometry of [body, outline]) {
        expect(geometry.getAttribute('skinIndex').count).toBe(
          geometry.getAttribute('position').count,
        );
        expect(geometry.getAttribute('skinWeight').count).toBe(
          geometry.getAttribute('position').count,
        );
      }
      expect(body.getAttribute('color')).toBeDefined();
      body.computeBoundingBox();
      expect(body.boundingBox?.min.y ?? -1).toBeGreaterThanOrEqual(-0.01);
      expect(body.boundingBox?.max.y ?? 9).toBeLessThan(CHARACTER_HEIGHT + 0.1);
      body.dispose();
      outline.dispose();
    }
  });

  it('gives each accessory its own silhouette (different vertex counts per role)', () => {
    const counts = new Set(
      [null, ...roleSchema.options].map(
        (role) => buildCharacterGeometry('#ff8c42', role).body.getAttribute('position').count,
      ),
    );
    expect(counts.size).toBe(roleSchema.options.length + 1);
  });

  it('names every bone so clips can bind to them', () => {
    const rig = createCharacterRig('#3a86ff', 'archivist', { shadows: false });
    for (const name of BONE_NAMES) {
      expect(rig.root.getObjectByName(name)).toBe(rig.bones[name]);
    }
    expect(rig.body.skeleton.bones).toHaveLength(BONE_NAMES.length);
    expect(rig.outline.skeleton).toBe(rig.body.skeleton);
    rig.dispose();
  });
});

describe('character clips', () => {
  it('builds every base and gesture clip with tracks only for rig bones', () => {
    const clips = characterClips();
    for (const name of [...BASE_CLIPS, ...GESTURE_CLIPS]) {
      const clip = clips[name];
      expect(clip.duration).toBeGreaterThan(0);
      expect(clip.validate()).toBe(true);
      for (const track of clip.tracks) {
        const bone = track.name.split('.')[0];
        expect(BONE_NAMES as readonly string[]).toContain(bone ?? '');
      }
    }
  });

  it('keeps locomotion clips the same length so blended steps stay in phase', () => {
    const clips = characterClips();
    expect(clips.walk.duration).toBe(clips.run.duration);
    expect(clips.walk.duration).toBe(clips.carryWalk.duration);
  });
});

describe('character animation state', () => {
  it('idles when standing still', () => {
    expect(targetBaseWeights(idle).idle).toBe(1);
  });

  it('walks when moving slowly and runs at full speed', () => {
    const slow = targetBaseWeights({ ...idle, moving: true, speedFraction: 0.3 });
    expect(slow.walk).toBe(1);
    expect(slow.run).toBe(0);
    const fast = targetBaseWeights({ ...idle, moving: true, speedFraction: 1 });
    expect(fast.run).toBe(1);
    const between = targetBaseWeights({ ...idle, moving: true, speedFraction: 0.7 });
    expect(between.walk + between.run).toBeCloseTo(1);
    expect(between.run).toBeGreaterThan(0);
  });

  it('holds the folder forward while carrying, standing or walking', () => {
    expect(targetBaseWeights({ ...idle, carrying: true }).carryIdle).toBe(1);
    expect(targetBaseWeights({ ...idle, carrying: true, moving: true }).carryWalk).toBe(1);
  });

  it('works at a station only while standing at it', () => {
    expect(targetBaseWeights({ ...idle, working: true }).work).toBe(1);
    expect(targetBaseWeights({ ...idle, working: true, moving: true }).work).toBe(0);
  });

  it('steps faster at full speed', () => {
    expect(strideRate(1)).toBeGreaterThan(strideRate(0.3));
  });

  it('fades gestures in and out', () => {
    expect(gestureWeight(0, 1)).toBe(0);
    expect(gestureWeight(GESTURE_FADE_IN_S / 2, 1)).toBeCloseTo(0.5);
    expect(gestureWeight(0.5, 1)).toBe(1);
    expect(gestureWeight(1, 1)).toBe(0);
  });

  it('maps cue triggers to gestures', () => {
    expect(gestureForTrigger('stampSlam')).toBe('stamp');
    expect(gestureForTrigger('cheer')).toBe('cheer');
    expect(gestureForTrigger('facepalm')).toBe('facepalm');
    expect(gestureForTrigger('shrug')).toBe('shrug');
    expect(gestureForTrigger('slump')).toBe('slump');
    expect(gestureForTrigger('hop')).toBeNull();
  });

  it('updates far, off-screen and low-preset characters less often', () => {
    expect(mixerInterval('high', true, 10)).toBe(0);
    expect(mixerInterval('low', true, 10)).toBeGreaterThan(0);
    expect(mixerInterval('high', true, LOD_FAR_DISTANCE + 1)).toBeGreaterThan(0);
    expect(mixerInterval('high', false, 10)).toBeGreaterThan(mixerInterval('low', true, 10));
  });

  it('plays a gesture to the end and returns to the base layers', () => {
    const rig = createCharacterRig('#3a86ff', null, { shadows: false });
    const controller = createCharacterController(rig.root);
    controller.play('cheer');
    expect(controller.gesture).toBe('cheer');
    const restHips = rig.bones.hips.position.y;
    controller.update(idle, 0.3, 0.3);
    expect(rig.bones.hips.position.y).not.toBeCloseTo(restHips, 3);
    for (let i = 0; i < 100; i++) {
      controller.update(idle, 1 / 30, 1 / 30);
    }
    expect(controller.gesture).toBeNull();
    controller.dispose();
    rig.dispose();
  });
});
