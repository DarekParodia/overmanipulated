// The intro's script (S7-99): eleven scenes in order, each with its narrator clip (one per input
// device where the line names keys or buttons) and what the stage shows. The words live in
// `pl.intro.voice`; this file only orders them, typesets the subtitles and gives every clip a
// stable id, which the voice sprite (`voice-sprite.json`, S7-100) and the line export
// (`tools/audio/intro-lines.ts`) are keyed on.
//
// Gameplay scenes are "in-engine" (S7-101): the shared sim runs locally on a mini layout and a
// scripted input track drives it, so the stage is the real game, never a video file. Each such
// scene names its track here; `intro/intro-sim.ts` (S7-101) owns the inputs behind the name. The
// other scenes are drawn from the UI kit (FolderCard, VerdictStamp, ControlsArt, RoleIcon…).
import type { InputDevice } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';

export const INTRO_DEVICES: readonly InputDevice[] = ['keyboard', 'gamepad', 'touch'];

export const INTRO_SCENE_IDS = [
  'welcome',
  'folders',
  'pickup',
  'work',
  'stations',
  'desk',
  'proof',
  'credibility',
  'roles',
  'team',
  'end',
] as const;
export type IntroSceneId = (typeof INTRO_SCENE_IDS)[number];

/** Scenes whose line names keys or buttons: one clip per input device. */
type DeviceSceneId = 'pickup' | 'work' | 'roles';
type SharedSceneId = Exclude<IntroSceneId, DeviceSceneId>;

/** A clip id: the scene id, plus the device for device scenes (`pickup.touch`). */
export type IntroClipId = SharedSceneId | `${DeviceSceneId}.${InputDevice}`;

/**
 * Scripted input tracks for the in-engine scenes; each one plays a single beat of the core loop
 * on the mini layout (conveyor, two stations, desk).
 */
export type IntroTrackId =
  /** Folders ride in on the conveyor while the next-folder card counts down. */
  | 'conveyorArrivals'
  /** A reporter walks to the conveyor and picks a folder up. */
  | 'pickUpFolder'
  /** The folder goes onto a station and the work ring fills while the work input is held. */
  | 'holdWork'
  /** The minigame is solved and the stamp lands on the folder. */
  | 'earnStamp'
  /** At the desk the stamp is cited, then a verdict is stamped. */
  | 'citeAndVerdict';

/** UI-kit art: a whole kit scene, or the callout over an in-engine scene. */
export type IntroArt =
  | 'masthead'
  | 'nextFolderCard'
  | 'controlsMove'
  | 'controlsWork'
  | 'stationSigns'
  | 'deskSheet'
  | 'proofCards'
  | 'hudPill'
  | 'roleAbility'
  | 'teamBubbles'
  | 'kolegium';

export type IntroStage =
  | { kind: 'kit'; art: IntroArt }
  | { kind: 'engine'; track: IntroTrackId; callout: IntroArt };

export type IntroScene = {
  id: IntroSceneId;
  /** True when the line differs per input device. */
  byDevice: boolean;
  stage: IntroStage;
};

export type IntroClip = {
  id: IntroClipId;
  scene: IntroSceneId;
  /** The device this clip is for; null when every device hears the same line. */
  device: InputDevice | null;
  /** The typeset subtitle; the voice says the same words (S7-100 checks its sha1). */
  subtitle: string;
};

export const INTRO_SCENES: readonly IntroScene[] = [
  { id: 'welcome', byDevice: false, stage: { kind: 'kit', art: 'masthead' } },
  {
    id: 'folders',
    byDevice: false,
    stage: { kind: 'engine', track: 'conveyorArrivals', callout: 'nextFolderCard' },
  },
  {
    id: 'pickup',
    byDevice: true,
    stage: { kind: 'engine', track: 'pickUpFolder', callout: 'controlsMove' },
  },
  {
    id: 'work',
    byDevice: true,
    stage: { kind: 'engine', track: 'holdWork', callout: 'controlsWork' },
  },
  {
    id: 'stations',
    byDevice: false,
    stage: { kind: 'engine', track: 'earnStamp', callout: 'stationSigns' },
  },
  {
    id: 'desk',
    byDevice: false,
    stage: { kind: 'engine', track: 'citeAndVerdict', callout: 'deskSheet' },
  },
  { id: 'proof', byDevice: false, stage: { kind: 'kit', art: 'proofCards' } },
  { id: 'credibility', byDevice: false, stage: { kind: 'kit', art: 'hudPill' } },
  { id: 'roles', byDevice: true, stage: { kind: 'kit', art: 'roleAbility' } },
  { id: 'team', byDevice: false, stage: { kind: 'kit', art: 'teamBubbles' } },
  { id: 'end', byDevice: false, stage: { kind: 'kit', art: 'kolegium' } },
];

const voice = pl.intro.voice;

function deviceClips(scene: DeviceSceneId, lines: Readonly<Record<InputDevice, string>>) {
  return INTRO_DEVICES.map(
    (device): IntroClip => ({
      id: `${scene}.${device}`,
      scene,
      device,
      subtitle: typeset(lines[device]),
    }),
  );
}

function sharedClip(scene: SharedSceneId): IntroClip {
  return { id: scene, scene, device: null, subtitle: typeset(voice[scene]) };
}

/** Every narrator clip, in scene order (device variants keyboard, gamepad, touch). */
export const INTRO_CLIPS: readonly IntroClip[] = [
  sharedClip('welcome'),
  sharedClip('folders'),
  ...deviceClips('pickup', voice.pickup),
  ...deviceClips('work', voice.work),
  sharedClip('stations'),
  sharedClip('desk'),
  sharedClip('proof'),
  sharedClip('credibility'),
  ...deviceClips('roles', voice.roles),
  sharedClip('team'),
  sharedClip('end'),
];

/** The clip a player on `device` hears in `scene`. */
export function introClipFor(scene: IntroSceneId, device: InputDevice): IntroClip {
  const clip = INTRO_CLIPS.find(
    (candidate) =>
      candidate.scene === scene && (candidate.device === null || candidate.device === device),
  );
  if (!clip) {
    throw new Error(`No intro clip for ${scene} on ${device}`);
  }
  return clip;
}

/** One clip per scene, in scene order, for one device: what the player watches. */
export function introClipsFor(device: InputDevice): readonly IntroClip[] {
  return INTRO_SCENES.map((scene) => introClipFor(scene.id, device));
}
