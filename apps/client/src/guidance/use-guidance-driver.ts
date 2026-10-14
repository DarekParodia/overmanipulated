// Feeds the guidance stores from the live game: recomputes the next step a few times a second
// (the interaction target and position change every frame but are not reactive) and turns
// gameplay events and the player's first steps into tutorial signals. The local role ability's
// preview (S7-45) goes into the next step, so a press that helps right now becomes the hint.
import { getStory } from '@redakcja/content';
import { useEffect } from 'react';
import { localAbility } from '../abilities/use-ability.ts';
import { nextFolderState } from '../hud/hud-model.ts';
import { onGameEvent } from '../net/game-events.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { highlightState } from '../scene/InteractionHighlight.tsx';
import { renderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { abilityHintKey, type NextStep, type NextStepAbility, nextStep } from './next-step.ts';
import { useGuidance } from './store.ts';
import { abilityStepApplies, MOVED_DISTANCE, signalForEvent } from './tutorial.ts';
import { useTutorial } from './tutorial-store.ts';

const REFRESH_MS = 150;

/** The local role ability as the hint reads it; undefined without a role. */
function liveAbility(): NextStepAbility | undefined {
  const app = useApp.getState();
  const { ability, preview } = localAbility(runtime, app.playerId);
  return ability === null
    ? undefined
    : { ability, preview, key: abilityHintKey(app.inputDevice, ability) };
}

/** Whether the tutorial's ability step applies: a role whose ability can act in this run. */
function localHasRole(): boolean {
  const { room, playerId } = useApp.getState();
  const me = room?.players.find((p) => p.id === playerId);
  const others = (room?.players ?? []).filter(
    (p) => p.id !== playerId && p.connected && p.team === me?.team,
  );
  return abilityStepApplies(
    me?.role ?? null,
    useGame.getState().stations.map((station) => station.kind),
    others.length,
  );
}

/** The local player's next step right now. */
export function liveNextStep(): NextStep {
  const game = useGame.getState();
  const app = useApp.getState();
  const ability = liveAbility();
  return nextStep({
    playerId: app.playerId,
    folders: game.folders,
    stations: game.stations,
    desks: game.desks,
    map: runtime.map,
    targetFixtureId: highlightState.targetId,
    device: app.inputDevice,
    story: getStory,
    next: nextFolderState(game.nextFolder, game.conveyorFull, game.elapsedMs),
    ...(ability ? { ability } : {}),
  });
}

export function useGuidanceDriver(): void {
  useEffect(() => {
    useTutorial.getState().start(localHasRole());
    // Forget the previous level's position, so the "moved" step needs a real first step.
    renderState.local = null;
    let origin: { x: number; y: number } | null = null;
    const timer = setInterval(() => {
      useGuidance.getState().setStep(liveNextStep());
      // The level's stations arrive with the first snapshot (and the role may change).
      useTutorial.getState().setHasRole(localHasRole());
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
