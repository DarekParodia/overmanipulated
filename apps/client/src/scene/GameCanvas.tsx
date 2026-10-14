// The 3D newsroom. Flat Lambert materials and no tone mapping keep scene colours true to the
// design tokens; quality presets control DPR and shadows. Renders one GameView (S7-85), the local
// player's unless another is given; only the primary canvas probes the device, drives adaptive
// quality and installs the debug hooks, so a second canvas beside it is a plain view. A spectator
// view (S7-90) renders at most on the medium preset with DPR 1.5 and no shadows, so two of them
// side by side stay inside the desktop render budget.
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three';
import { AbilityMarkers } from '../abilities/AbilityMarkers.tsx';
import { installGameHook, registerSceneRenderer } from '../debug/game-hook.ts';
import { perfStats } from '../debug/perf-stats.ts';
import type { GameView } from '../net/game-view.ts';
import { GameViewProvider, useGameView } from '../net/view-context.tsx';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { Ambience } from './Ambience.tsx';
import { CameraRig } from './CameraRig.tsx';
import { Driver } from './Driver.tsx';
import { EventMarkers } from './EventMarkers.tsx';
import { EventsWorld } from './EventsWorld.tsx';
import { Fixtures } from './Fixtures.tsx';
import { Folders } from './Folders.tsx';
import { GuidanceMarkers } from './GuidanceMarkers.tsx';
import { InteractionHighlight } from './InteractionHighlight.tsx';
import { Newsroom } from './Newsroom.tsx';
import { Particles } from './Particles.tsx';
import { PerfProbe } from './PerfProbe.tsx';
import { PingBubbles } from './PingBubbles.tsx';
import { Players } from './Players.tsx';
import {
  detectPreset,
  deviceHints,
  isCoarsePointer,
  profileFor,
  type QualityProfile,
  spectatorProfile,
  useQuality,
} from './quality.ts';
import { StationIndicators } from './StationIndicators.tsx';
import { SunLight } from './SunLight.tsx';
import { Warmup } from './Warmup.tsx';

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info
    ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
}

const viewIds = new WeakMap<GameView, number>();
let lastViewId = 0;

/** A stable id per GameView object, for React keys. */
function viewId(view: GameView): number {
  let id = viewIds.get(view);
  if (id === undefined) {
    lastViewId += 1;
    id = lastViewId;
    viewIds.set(view, id);
  }
  return id;
}

const uncapped = (profile: QualityProfile): QualityProfile => profile;

/** The quality cap of a view: `spectatorProfile` for a spectator, none for the player or intro. */
function capFor(view: GameView): (profile: QualityProfile) => QualityProfile {
  return view.kind === 'spectator' ? spectatorProfile : uncapped;
}

export type GameCanvasProps = {
  /** The view to render; the nearest provider's (else the local player's) when left out. */
  view?: GameView;
  /** The one canvas that detects the GPU preset, adapts quality and installs debug hooks. */
  primary?: boolean;
  /** Key of this canvas's renderer counters in `perfStats.views`. */
  viewKey?: string;
};

export function GameCanvas({ view: given, primary = true, viewKey = 'main' }: GameCanvasProps) {
  const fallback = useGameView();
  const view = given ?? fallback;
  const playing = view.kind === 'player';
  // The store holds the capped profile while spectating, so the props that read it (motes,
  // small props, particles) follow the cap too; capping here as well covers a stale store.
  const fit = capFor(view);
  const profile = fit(useQuality((s) => s.profile));
  const chosen = useSettings((s) => s.quality);
  // A preset picked in settings is final (auto off). Back on "auto" the detected preset returns.
  useEffect(() => {
    if (!primary) {
      return;
    }
    const coarse = isCoarsePointer();
    const cap = capFor(view);
    if (chosen) {
      useQuality.getState().choose(cap(profileFor(chosen, coarse, window.devicePixelRatio)), false);
    } else if (perfStats.gpu) {
      const preset = detectPreset(perfStats.gpu, coarse, deviceHints());
      useQuality.getState().choose(cap(profileFor(preset, coarse, window.devicePixelRatio)), true);
    }
  }, [chosen, primary, view]);

  return (
    <Canvas
      dpr={[1, profile.maxDpr]}
      shadows={profile.shadows}
      flat
      gl={{ antialias: profile.preset !== 'low', powerPreference: 'high-performance' }}
      camera={{ position: [10, 14, 16], fov: 32 }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
        if (!primary) {
          return;
        }
        if (new URLSearchParams(window.location.search).has('debug')) {
          // Dev aid: inspect the scene from the console or end-to-end tests.
          (window as unknown as { __scene?: unknown; __quality?: unknown }).__scene = scene;
          (window as unknown as { __quality?: unknown }).__quality = useQuality;
          installGameHook();
          registerSceneRenderer(gl);
        }
        const name = gpuName(gl.getContext());
        perfStats.gpu = name;
        if (!useSettings.getState().quality) {
          const coarse = isCoarsePointer();
          const preset = detectPreset(name, coarse, deviceHints());
          useQuality
            .getState()
            .choose(fit(profileFor(preset, coarse, window.devicePixelRatio)), true);
        }
      }}
      style={{ touchAction: 'none' }}
    >
      <GameViewProvider view={view}>
        <color attach="background" args={[colors.sky]} />
        <hemisphereLight args={[colors.surface, colors.furniture, 1.6]} />
        <ViewScene key={viewId(view)} playing={playing} profile={profile} />
        <PerfProbe viewKey={viewKey} primary={primary} />
        <Warmup />
      </GameViewProvider>
    </Canvas>
  );
}

/**
 * Everything that renders the view. Keyed by the view, so a canvas that switches views (the
 * spectate screen's team switch on a phone, S7-90) remounts its scene in the same WebGL context
 * instead of creating a new one.
 */
function ViewScene({ playing, profile }: { playing: boolean; profile: QualityProfile }) {
  // World props (and the sun's shadow box) read the view's map once; remount them when a level
  // with another map starts. The intro (S7-101) wears its own level, every other view the room's.
  const view = useGameView();
  const roomLevelId = useApp((s) => s.room?.levelId ?? '');
  const levelId = view.levelId ?? roomLevelId;
  return (
    <>
      <Driver />
      <CameraRig />
      <group key={levelId}>
        <SunLight shadows={profile.shadows} />
        <Newsroom shadows={profile.shadows} />
        <Ambience />
        <Fixtures shadows={profile.shadows} />
        {playing && <InteractionHighlight />}
        <StationIndicators />
        <Folders />
        <EventsWorld />
        <EventMarkers />
        {playing && <GuidanceMarkers />}
      </group>
      <Players shadows={profile.shadows} />
      <PingBubbles />
      <AbilityMarkers />
      <Particles />
    </>
  );
}
