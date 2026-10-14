// The 3D newsroom. Flat Lambert materials and no tone mapping keep scene colours true to the
// design tokens; quality presets control DPR and shadows. Renders one GameView (S7-85), the local
// player's unless another is given; only the primary canvas probes the device, drives adaptive
// quality and installs the debug hooks, so a second canvas beside it is a plain view.
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three';
import { AbilityMarkers } from '../abilities/AbilityMarkers.tsx';
import { installGameHook } from '../debug/game-hook.ts';
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
import { detectPreset, deviceHints, isCoarsePointer, profileFor, useQuality } from './quality.ts';
import { StationIndicators } from './StationIndicators.tsx';
import { SunLight } from './SunLight.tsx';
import { Warmup } from './Warmup.tsx';

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info
    ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
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
  const profile = useQuality((s) => s.profile);
  const chosen = useSettings((s) => s.quality);
  // World props (and the sun's shadow box) read the view's map once; remount them when a level
  // with another map starts.
  const roomLevelId = useApp((s) => s.room?.levelId ?? '');
  const levelId = view.levelId ?? roomLevelId;

  // A preset picked in settings is final (auto off). Back on "auto" the detected preset returns.
  useEffect(() => {
    if (!primary) {
      return;
    }
    const coarse = isCoarsePointer();
    if (chosen) {
      useQuality.getState().choose(profileFor(chosen, coarse, window.devicePixelRatio), false);
    } else if (perfStats.gpu) {
      const preset = detectPreset(perfStats.gpu, coarse, deviceHints());
      useQuality.getState().choose(profileFor(preset, coarse, window.devicePixelRatio), true);
    }
  }, [chosen, primary]);

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
        }
        const name = gpuName(gl.getContext());
        perfStats.gpu = name;
        if (!useSettings.getState().quality) {
          const coarse = isCoarsePointer();
          const preset = detectPreset(name, coarse, deviceHints());
          useQuality.getState().choose(profileFor(preset, coarse, window.devicePixelRatio), true);
        }
      }}
      style={{ touchAction: 'none' }}
    >
      <GameViewProvider view={view}>
        <color attach="background" args={[colors.sky]} />
        <hemisphereLight args={[colors.surface, colors.furniture, 1.6]} />
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
        <PerfProbe viewKey={viewKey} primary={primary} />
        <Warmup />
      </GameViewProvider>
    </Canvas>
  );
}
