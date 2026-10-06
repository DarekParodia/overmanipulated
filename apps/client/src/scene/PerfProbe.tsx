// Collects frame time and renderer counters, and steps quality down automatically when the
// device can't hold the budget (only when the player left quality on "auto").
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { perfStats, smoothFrameTime } from '../debug/perf-stats.ts';
import { useSettings } from '../store/settings.ts';
import { isCoarsePointer, lowerPreset, profileFor, useQuality } from './quality.ts';

/** Average frame time above this for STEP_DOWN_AFTER_S seconds lowers the preset. */
const SLOW_FRAME_MS = 24;
const STEP_DOWN_AFTER_S = 3;

export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const slowFor = useRef(0);

  useFrame((_, delta) => {
    const ms = delta * 1000;
    perfStats.frameMs = smoothFrameTime(perfStats.frameMs, ms);
    perfStats.fps = perfStats.frameMs > 0 ? 1000 / perfStats.frameMs : 0;
    // three resets these at the start of each render, so here they describe the previous frame.
    perfStats.drawCalls = gl.info.render.calls;
    perfStats.triangles = gl.info.render.triangles;

    const { auto, profile, set } = useQuality.getState();
    if (!auto || useSettings.getState().quality !== null || profile.preset === 'low') {
      slowFor.current = 0;
      return;
    }
    slowFor.current = perfStats.frameMs > SLOW_FRAME_MS ? slowFor.current + delta : 0;
    if (slowFor.current > STEP_DOWN_AFTER_S) {
      slowFor.current = 0;
      set(
        profileFor(lowerPreset(profile.preset), isCoarsePointer(), window.devicePixelRatio),
        true,
      );
    }
  });

  return null;
}
