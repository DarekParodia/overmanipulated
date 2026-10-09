// Gameplay screen: the 3D newsroom with the HUD (hud/Hud.tsx), round tool buttons for
// fullscreen, settings and leaving (with the room chip under them), touch controls on touch
// devices and the rotate prompt.
import { useEffect } from 'react';
import { CaptionStack } from '../a11y/CaptionStack.tsx';
import { startAmbience, stopAmbience } from '../fx/audio/audio-manager.ts';
import { requestMusic } from '../fx/audio/music.ts';
import { Guidance } from '../guidance/Guidance.tsx';
import { Hud } from '../hud/Hud.tsx';
import { RoomChip } from '../hud/RoomChip.tsx';
import { attachInput } from '../input/input-manager.ts';
import { TouchControls } from '../input/TouchControls.tsx';
import { canFullscreen, toggleFullscreen, useWakeLock } from '../mobile/device.ts';
import { RotatePrompt } from '../mobile/RotatePrompt.tsx';
import { leaveRoom } from '../net/session.ts';
import { PingPicker } from '../pings/PingPicker.tsx';
import { GameCanvas } from '../scene/GameCanvas.tsx';
import { isCoarsePointer } from '../scene/quality.ts';
import { StationLayer } from '../stations/StationLayer.tsx';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './GameScreen.module.css';

export function GameScreen() {
  const connection = useApp((s) => s.connection);
  const device = useApp((s) => s.inputDevice);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
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

      <div className={styles.tools}>
        <div className={styles.toolRow}>
          {canFullscreen() && (
            <Button
              icon={<Icon name="fullscreen" label={pl.game.fullscreen} />}
              onClick={() => void toggleFullscreen()}
            />
          )}
          <Button
            icon={<Icon name="settings" label={pl.game.settings} />}
            onClick={() => setSettingsOpen(true)}
          />
          <Button back icon={<Icon name="leave" label={pl.game.leave} />} onClick={leaveRoom} />
        </div>
        <RoomChip />
      </div>

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
      <RotatePrompt />
    </main>
  );
}
