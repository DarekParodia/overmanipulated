import { lazy, Suspense, useEffect } from 'react';
import { startCaptions } from './a11y/caption-store.ts';
import { PerfOverlay } from './debug/PerfOverlay.tsx';
import { initAudio, playSound } from './fx/audio/audio-manager.ts';
import { feedback } from './fx/feedback.ts';
import { startGameplayFeedback } from './fx/gameplay-feedback.ts';
import { vibrate } from './fx/haptics.ts';
import { handleVisibilityReturn, resumeIfPossible } from './net/session.ts';
import { Briefing } from './screens/Briefing.tsx';
import { Loading } from './screens/Loading.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { SettingsPanel } from './screens/SettingsPanel.tsx';
import { Styleguide } from './screens/Styleguide.tsx';
import { useApp } from './store/app.ts';
import { applySettingsToDocument, useSettings } from './store/settings.ts';

// three.js and the scene load only when a match starts, keeping the menu light on phones.
const GameScreen = lazy(() =>
  import('./screens/GameScreen.tsx').then((module) => ({ default: module.GameScreen })),
);

export function App() {
  const screen = useApp((s) => s.screen);

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

  return (
    <>
      {screen === 'mainMenu' && <MainMenu />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'game' && (
        <Suspense fallback={<Loading />}>
          <GameScreen />
        </Suspense>
      )}
      {screen === 'styleguide' && <Styleguide />}
      <SettingsPanel />
      <PerfOverlay />
    </>
  );
}
