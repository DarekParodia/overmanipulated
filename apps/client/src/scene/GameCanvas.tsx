// The 3D newsroom. Flat Lambert materials and no tone mapping keep scene colours true to the
// design tokens; quality presets control DPR and shadows.
import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three';
import { installGameHook } from '../debug/game-hook.ts';
import { perfStats } from '../debug/perf-stats.ts';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { CameraRig } from './CameraRig.tsx';
import { Driver } from './Driver.tsx';
import { Fixtures } from './Fixtures.tsx';
import { Folders } from './Folders.tsx';
import { InteractionHighlight } from './InteractionHighlight.tsx';
import { Newsroom } from './Newsroom.tsx';
import { Particles } from './Particles.tsx';
import { PerfProbe } from './PerfProbe.tsx';
import { PingBubbles } from './PingBubbles.tsx';
import { Players } from './Players.tsx';
import { detectPreset, isCoarsePointer, profileFor, useQuality } from './quality.ts';
import { StationIndicators } from './StationIndicators.tsx';
import { Warmup } from './Warmup.tsx';

function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info
    ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : String(gl.getParameter(gl.RENDERER));
}

export function GameCanvas() {
  const profile = useQuality((s) => s.profile);
  const chosen = useSettings((s) => s.quality);
  // World props read `runtime.map` once; remount them when a level with another map starts.
  const levelId = useApp((s) => s.room?.levelId ?? '');

  useEffect(() => {
    if (chosen) {
      useQuality
        .getState()
        .set(profileFor(chosen, isCoarsePointer(), window.devicePixelRatio), false);
    }
  }, [chosen]);

  return (
    <Canvas
      dpr={[1, profile.maxDpr]}
      shadows={profile.shadows}
      flat
      gl={{ antialias: profile.preset !== 'low', powerPreference: 'high-performance' }}
      camera={{ position: [10, 14, 16], fov: 32 }}
      onCreated={({ gl, scene }) => {
        if (new URLSearchParams(window.location.search).has('debug')) {
          // Dev aid: inspect the scene from the console or end-to-end tests.
          (window as unknown as { __scene?: unknown }).__scene = scene;
          installGameHook();
        }
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
        const name = gpuName(gl.getContext());
        perfStats.gpu = name;
        if (!useSettings.getState().quality) {
          const preset = detectPreset(name, isCoarsePointer());
          useQuality
            .getState()
            .set(profileFor(preset, isCoarsePointer(), window.devicePixelRatio), true);
        }
      }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[colors.sky]} />
      <hemisphereLight args={[colors.surface, colors.furniture, 1.6]} />
      <directionalLight
        position={[4, 12, 6]}
        intensity={1.5}
        color={colors.surface}
        castShadow={profile.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <Driver />
      <CameraRig />
      <group key={levelId}>
        <Newsroom shadows={profile.shadows} />
        <Fixtures shadows={profile.shadows} />
        <InteractionHighlight />
        <StationIndicators />
        <Folders />
      </group>
      <Players shadows={profile.shadows} />
      <PingBubbles />
      <Particles />
      <PerfProbe />
      <Warmup />
    </Canvas>
  );
}
