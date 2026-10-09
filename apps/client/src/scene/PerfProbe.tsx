// Collects frame time and renderer counters, and walks the degrade ladder when the device can't
// hold the budget (only when the player left quality on "auto"; see adaptive-quality.ts).
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { perfStats, smoothFrameTime } from '../debug/perf-stats.ts';
import { useSettings } from '../store/settings.ts';
import { createAdaptiveController } from './adaptive-quality.ts';
import { degradeLadder, useQuality } from './quality.ts';

export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const controller = useMemo(createAdaptiveController, []);
  const base = useQuality((s) => s.base);
  const maxStage = useMemo(() => degradeLadder(base).length - 1, [base]);

  // A new base preset (detection finished, or the player picked one) starts with a clean slate.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `base` is the trigger, not a value.
  useEffect(() => controller.reset(), [controller, base]);

  useFrame((_, delta) => {
    const ms = delta * 1000;
    perfStats.frameMs = smoothFrameTime(perfStats.frameMs, ms);
    perfStats.fps = perfStats.frameMs > 0 ? 1000 / perfStats.frameMs : 0;
    // three resets these at the start of each render, so here they describe the previous frame.
    perfStats.drawCalls = gl.info.render.calls;
    perfStats.triangles = gl.info.render.triangles;

    const quality = useQuality.getState();
    // A fixed preset in settings is never touched; hidden tabs don't produce samples.
    if (!quality.auto || useSettings.getState().quality !== null || document.hidden) {
      return;
    }
    const decision = controller.update(delta, quality.stage, maxStage);
    if (decision !== 0) {
      quality.setStage(quality.stage + decision);
    }
  });

  return null;
}
