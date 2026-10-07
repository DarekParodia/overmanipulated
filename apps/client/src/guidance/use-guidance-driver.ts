// Feeds the guidance stores from the live game: recomputes the next step a few times a second
// (the interaction target and position change every frame but are not reactive) and turns
// gameplay events and the player's first steps into tutorial signals.
import { getStory } from '@redakcja/content';
import { useEffect } from 'react';
import { onGameEvent } from '../net/game-events.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { highlightState } from '../scene/InteractionHighlight.tsx';
import { renderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { type NextStep, nextStep } from './next-step.ts';
import { useGuidance } from './store.ts';
import { MOVED_DISTANCE, signalForEvent } from './tutorial.ts';
import { useTutorial } from './tutorial-store.ts';

const REFRESH_MS = 150;

/** The local player's next step right now. */
export function liveNextStep(): NextStep {
  const game = useGame.getState();
  const app = useApp.getState();
  return nextStep({
    playerId: app.playerId,
    folders: game.folders,
    stations: game.stations,
    desks: game.desks,
    map: runtime.map,
    targetFixtureId: highlightState.targetId,
    device: app.inputDevice,
    story: getStory,
  });
}

export function useGuidanceDriver(): void {
  useEffect(() => {
    useTutorial.getState().start();
    // Forget the previous level's position, so the "moved" step needs a real first step.
    renderState.local = null;
    let origin: { x: number; y: number } | null = null;
    const timer = setInterval(() => {
      useGuidance.getState().setStep(liveNextStep());
      const local = renderState.local;
      if (!local) {
        return;
      }
      origin ??= { x: local.x, y: local.y };
      if (Math.hypot(local.x - origin.x, local.y - origin.y) >= MOVED_DISTANCE) {
        useTutorial.getState().signal('moved');
      }
    }, REFRESH_MS);
    const unsubscribe = onGameEvent((event) => {
      const signal = signalForEvent(event, useApp.getState().playerId);
      if (signal) {
        useTutorial.getState().signal(signal);
      }
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
      useGuidance.getState().setStep(null);
    };
  }, []);
}
