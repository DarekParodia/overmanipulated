import { useEffect } from 'react';
import { startCaptions } from './a11y/caption-store.ts';
import { PerfOverlay } from './debug/PerfOverlay.tsx';
import { EncyclopediaScreen } from './encyclopedia/EncyclopediaScreen.tsx';
import { initAudio, playSound } from './fx/audio/audio-manager.ts';
import { feedback } from './fx/feedback.ts';
import { startGameplayFeedback } from './fx/gameplay-feedback.ts';
import { vibrate } from './fx/haptics.ts';
import { useMenuNavigation } from './input/menu-nav.ts';
import { GameGate } from './loading/GameGate.tsx';
import { startPreload } from './loading/preload.ts';
import { handleVisibilityReturn, resumeIfPossible } from './net/session.ts';
import { Briefing } from './screens/Briefing.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { SettingsPanel } from './screens/SettingsPanel.tsx';
import { Styleguide } from './screens/Styleguide.tsx';
import { useApp } from './store/app.ts';
import { applySettingsToDocument, useSettings } from './store/settings.ts';

export function App() {
  const screen = useApp((s) => s.screen);
  useMenuNavigation();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('styleguide')) {
      useApp.getState().setScreen('styleguide');
    } else {
      resumeIfPossible();
    }
    applySettingsToDocument(useSettings.getState());
    const unsubscribeSettings = useSettings.subscribe(applySettingsToDocument);
    const stopAudio = initAudio();
    const disconnectOutputs = feedback.connect({ playSound, vibrate });
    const stopGameplayFeedback = startGameplayFeedback();
    const stopCaptions = startCaptions();
    document.addEventListener('visibilitychange', handleVisibilityReturn);
    return () => {
      unsubscribeSettings();
      stopAudio();
      disconnectOutputs();
      stopGameplayFeedback();
      stopCaptions();
      document.removeEventListener('visibilitychange', handleVisibilityReturn);
    };
  }, []);

  // three.js and the scene are a separate chunk: the main menu stays light, and the download
  // starts as soon as the player heads for a match (the lobby and briefing time pays for it).
  useEffect(() => {
    if (screen === 'lobby' || screen === 'briefing') {
      startPreload();
    }
  }, [screen]);

  return (
    <>
      {screen === 'mainMenu' && <MainMenu />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'game' && <GameGate />}
      {screen === 'styleguide' && <Styleguide />}
      <SettingsPanel />
      <EncyclopediaScreen />
      <PerfOverlay />
    </>
  );
}
