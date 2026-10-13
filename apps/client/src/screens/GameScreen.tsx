// Gameplay screen: the 3D newsroom with the HUD (hud/Hud.tsx), the one menu button top-right
// with its sheet (hud/GameMenu: settings, fullscreen, room code, leave; pauses a solo level),
// touch controls on touch devices and the rotate prompt. The measured HUD band (hud/hud-band.ts)
// is published as `--hud-band` so captions, banners and toasts start under the HUD, and the pill's
// right edge as `--hud-pill-right` so the folder queue starts after it.
import { type CSSProperties, useEffect, useRef } from 'react';
import { CaptionStack } from '../a11y/CaptionStack.tsx';
import { startAmbience, stopAmbience } from '../fx/audio/audio-manager.ts';
import { requestMusic } from '../fx/audio/music.ts';
import { ScreenFx } from '../fx/screen/ScreenFx.tsx';
import { Guidance } from '../guidance/Guidance.tsx';
import { GameMenu } from '../hud/GameMenu.tsx';
import { GameMenuButton } from '../hud/GameMenuButton.tsx';
import { Hud } from '../hud/Hud.tsx';
import { useHudBand, useHudBandMeasure } from '../hud/hud-band.ts';
import { attachInput } from '../input/input-manager.ts';
import { TouchControls } from '../input/TouchControls.tsx';
import { useWakeLock } from '../mobile/device.ts';
import { RotatePrompt } from '../mobile/RotatePrompt.tsx';
import { PingPicker } from '../pings/PingPicker.tsx';
import { GameCanvas } from '../scene/GameCanvas.tsx';
import { isCoarsePointer } from '../scene/quality.ts';
import { StationLayer } from '../stations/StationLayer.tsx';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import styles from './GameScreen.module.css';

export function GameScreen() {
  const connection = useApp((s) => s.connection);
  const device = useApp((s) => s.inputDevice);
  const showTouch = device === 'touch' || isCoarsePointer();
  const screen = useRef<HTMLElement>(null);
  const band = useHudBand((s) => s.px);
  const pillRight = useHudBand((s) => s.pillRightPx);

  useHudBandMeasure(screen);

  useWakeLock(true);
  useEffect(() => attachInput(), []);
  useEffect(() => requestMusic('game'), []);
  useEffect(() => {
    startAmbience();
    return stopAmbience;
  }, []);

  return (
    <main
      ref={screen}
      className={styles.screen}
      // Until the first measurement each layer keeps its own fallback offset.
      style={
        band > 0
          ? ({ '--hud-band': `${band}px`, '--hud-pill-right': `${pillRight}px` } as CSSProperties)
          : undefined
      }
    >
      <GameCanvas />
      <ScreenFx />

      <GameMenuButton />
      <Hud />
      <CaptionStack />
      <Guidance />
      <StationLayer />
      <PingPicker />

      {connection === 'reconnecting' && (
        <p className={styles.banner} role="status">
          {pl.game.reconnecting}
        </p>
      )}

      {showTouch && <TouchControls />}
      <GameMenu />
      <RotatePrompt />
    </main>
  );
}
