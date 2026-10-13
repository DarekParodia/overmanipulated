// Gameplay screen: the 3D newsroom with the HUD (hud/Hud.tsx), the one menu button top-right
// with its sheet (hud/GameMenu: settings, fullscreen, room code, leave; pauses a solo level),
// touch controls on touch devices and the rotate prompt.
import { useEffect } from 'react';
import { CaptionStack } from '../a11y/CaptionStack.tsx';
import { startAmbience, stopAmbience } from '../fx/audio/audio-manager.ts';
import { requestMusic } from '../fx/audio/music.ts';
import { ScreenFx } from '../fx/screen/ScreenFx.tsx';
import { Guidance } from '../guidance/Guidance.tsx';
import { GameMenu } from '../hud/GameMenu.tsx';
import { GameMenuButton } from '../hud/GameMenuButton.tsx';
import { Hud } from '../hud/Hud.tsx';
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

  useWakeLock(true);
  useEffect(() => attachInput(), []);
  useEffect(() => requestMusic('game'), []);
  useEffect(() => {
    startAmbience();
    return stopAmbience;
  }, []);

  return (
    <main className={styles.screen}>
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
