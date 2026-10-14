import { lazy, Suspense, useEffect } from 'react';
import { startCaptions } from './a11y/caption-store.ts';
import { AboutHost } from './about/AboutHost.tsx';
import { useAdRequestPause } from './ads/use-ad-pause.ts';
import { PerfOverlay } from './debug/PerfOverlay.tsx';
import { EncyclopediaScreen } from './encyclopedia/EncyclopediaScreen.tsx';
import { initAudio, playSound } from './fx/audio/audio-manager.ts';
import { feedback } from './fx/feedback.ts';
import { startGameplayFeedback } from './fx/gameplay-feedback.ts';
import { vibrate } from './fx/haptics.ts';
import { HowToPlayHost } from './howto/HowToPlayHost.tsx';
import { useMenuNavigation } from './input/menu-nav.ts';
import { GameGate } from './loading/GameGate.tsx';
import { startPreload } from './loading/preload.ts';
import { startLookSync } from './net/look-sync.ts';
import { startProfileTracking } from './net/profile-tracking.ts';
import { handleVisibilityReturn, resumeIfPossible } from './net/session.ts';
import { ProfileHost } from './profile/ProfileHost.tsx';
import { RoomBrowserHost } from './rooms/RoomBrowserHost.tsx';
import { Briefing } from './screens/Briefing.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { MainMenu } from './screens/MainMenu.tsx';
import { SettingsPanel } from './screens/SettingsPanel.tsx';
import { useApp } from './store/app.ts';
import { usePublicConfig } from './store/public-config.ts';
import { applySettingsToDocument, useSettings } from './store/settings.ts';

// The design reference page (`?styleguide`) draws every minigame: a lazy chunk, so none of it
// rides along with the main menu (S7-101 keeps the menu code well under its 340 KB guard).
const Styleguide = lazy(() =>
  import('./screens/Styleguide.tsx').then((module) => ({ default: module.Styleguide })),
);

export function App() {
  const screen = useApp((s) => s.screen);
  useMenuNavigation();
  useAdRequestPause();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('styleguide')) {
      useApp.getState().setScreen('styleguide');
    } else {
      resumeIfPossible();
    }
    // Flags, MOTD and ads for this host: the shell embeds them, dev and preview fetch them.
    void usePublicConfig.getState().refresh(true);
    applySettingsToDocument(useSettings.getState());
    const unsubscribeSettings = useSettings.subscribe(applySettingsToDocument);
    const stopAudio = initAudio();
    const disconnectOutputs = feedback.connect({ playSound, vibrate });
    const stopGameplayFeedback = startGameplayFeedback();
    const stopCaptions = startCaptions();
    const stopProfileTracking = startProfileTracking();
    const stopLookSync = startLookSync();
    document.addEventListener('visibilitychange', handleVisibilityReturn);
    return () => {
      unsubscribeSettings();
      stopAudio();
      disconnectOutputs();
      stopGameplayFeedback();
      stopCaptions();
      stopProfileTracking();
      stopLookSync();
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
      {screen === 'spectate' && <GameGate which="spectate" />}
      {screen === 'styleguide' && (
        <Suspense fallback={null}>
          <Styleguide />
        </Suspense>
      )}
      <SettingsPanel />
      <RoomBrowserHost />
      <EncyclopediaScreen />
      {/* After the settings: opened from them, „Jak grać” must be the top dialog. */}
      <HowToPlayHost />
      <ProfileHost />
      <AboutHost />
      <PerfOverlay />
    </>
  );
}
