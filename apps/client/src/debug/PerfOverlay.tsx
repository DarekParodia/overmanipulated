// Dev perf overlay (S1-16): FPS, frame time, draw calls, triangles, particles, ping and
// snapshot buffer depth. Shown with ?debug or toggled with F3.
import { useEffect, useState } from 'react';
import { runtime } from '../net/session.ts';
import { useQuality } from '../scene/quality.ts';
import { useApp } from '../store/app.ts';
import styles from './PerfOverlay.module.css';
import { particleStats, perfStats } from './perf-stats.ts';

function initiallyVisible(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}

export function PerfOverlay() {
  const [visible, setVisible] = useState(initiallyVisible);
  const [, setTick] = useState(0);
  const rtt = useApp((s) => s.rttMs);
  const preset = useQuality((s) => s.profile.preset);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === 'F3') {
        event.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) {
    return null;
  }
  const rows: [string, string][] = [
    ['fps', perfStats.fps.toFixed(0)],
    ['frame', `${perfStats.frameMs.toFixed(1)} ms`],
    ['draw calls', String(perfStats.drawCalls)],
    ['triangles', String(perfStats.triangles)],
    ['particles', String(particleStats.alive)],
    ['ping', rtt === null ? '–' : `${rtt} ms`],
    ['snapshots ahead', String(runtime.buffer.depth(performance.now()))],
    ['pending inputs', String(runtime.predictor.pendingCount)],
    ['quality', preset],
    ['gpu', perfStats.gpu.slice(0, 40)],
  ];
  return (
    <dl className={styles.overlay} data-testid="perf-overlay">
      {rows.map(([key, value]) => (
        <div key={key} className={styles.row}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
