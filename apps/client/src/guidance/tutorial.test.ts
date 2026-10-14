// The role ability step of the first-game tutorial (S7-45): the 6th step, completed by the
// local player's ability press, skipped without a role.
import { beforeEach, describe, expect, test } from 'bun:test';
import { ROLES } from '@redakcja/shared';
import type { GameplayEvent } from '../fx/event-cues.ts';
import type { InputDevice } from '../store/app.ts';
import {
  ABILITY_STEP,
  abilityStepApplies,
  abilityStepText,
  advanceTutorial,
  signalForEvent,
  skipAbilityStep,
  TUTORIAL_DONE,
  TUTORIAL_STEPS,
  type TutorialSignal,
} from './tutorial.ts';
import { resetTutorial, useTutorial } from './tutorial-store.ts';

const ME = 'p1';
const DEVICES: readonly InputDevice[] = ['keyboard', 'gamepad', 'touch'];

function abilityEvent(stage: string, playerId = ME): GameplayEvent {
  return { kind: 'ability', playerId, ability: 'expertise', stage } as GameplayEvent;
}

describe('the ability step', () => {
  test('is the sixth and last step', () => {
    expect(TUTORIAL_STEPS).toEqual(['move', 'pickup', 'work', 'minigame', 'verdict', 'ability']);
    expect(ABILITY_STEP).toBe(5);
    expect(TUTORIAL_DONE).toBe(6);
  });

  test('is completed by the ability, and only once it is the current step', () => {
    expect(advanceTutorial(ABILITY_STEP, 'abilityUsed')).toBe(TUTORIAL_DONE);
    expect(advanceTutorial(0, 'abilityUsed')).toBe(0);
    expect(advanceTutorial(4, 'abilityUsed')).toBe(4);
    expect(advanceTutorial(ABILITY_STEP, 'verdict')).toBe(ABILITY_STEP);
  });

  test('skipAbilityStep: done without a role or with the ability used already', () => {
    expect(skipAbilityStep(ABILITY_STEP, false)).toBe(TUTORIAL_DONE);
    expect(skipAbilityStep(ABILITY_STEP, true)).toBe(ABILITY_STEP);
    expect(skipAbilityStep(ABILITY_STEP, true, true)).toBe(TUTORIAL_DONE);
    expect(skipAbilityStep(3, false)).toBe(3);
    expect(skipAbilityStep(TUTORIAL_DONE, true)).toBe(TUTORIAL_DONE);
  });

  test('applies only where the ability can act on the level', () => {
    // l1 has no phone and no documents station: a reporter or an archivist could never use it.
    const l1 = ['imageSearch', 'sourceRegistry'] as const;
    expect(abilityStepApplies('reporter', l1)).toBe(false);
    expect(abilityStepApplies('reporter', [...l1, 'phone'])).toBe(true);
    expect(abilityStepApplies('photoEditor', l1)).toBe(true);
    expect(abilityStepApplies('archivist', ['imageSearch'])).toBe(false);
    expect(abilityStepApplies('archivist', ['archive'])).toBe(true);
    for (const role of ['managingEditor', 'generalist', 'rescuer'] as const) {
      expect(abilityStepApplies(role, l1)).toBe(true);
    }
    expect(abilityStepApplies(null, l1)).toBe(false);
    // No snapshot yet: unknown, the step stays.
    expect(abilityStepApplies('reporter', [])).toBe(true);
  });

  test("the local player's armed, started or done ability counts", () => {
    expect(signalForEvent(abilityEvent('armed'), ME)).toBe('abilityUsed');
    expect(signalForEvent(abilityEvent('started'), ME)).toBe('abilityUsed');
    expect(signalForEvent(abilityEvent('done'), ME)).toBe('abilityUsed');
    expect(signalForEvent(abilityEvent('disarmed'), ME)).toBeUndefined();
    expect(signalForEvent(abilityEvent('cancelled'), ME)).toBeUndefined();
    expect(signalForEvent(abilityEvent('done', 'p2'), ME)).toBeUndefined();
  });

  test('the card names the key, the ability and what it does', () => {
    expect(abilityStepText('photoEditor', 'keyboard')).toBe(
      'R: Ekspertyza – zadanie przy obrazie od razu',
    );
    expect(abilityStepText('managingEditor', 'gamepad')).toBe(
      'RB: Przedłużenie – +20 s dla teczki',
    );
    expect(abilityStepText('reporter', 'touch')).toBe(
      '„Dzwoń”: Telefon z terenu – pieczątka Telefonu bez chodzenia',
    );
    expect(abilityStepText('generalist', 'keyboard')).toBe(
      'R: Druga szansa – po pudle jeszcze raz',
    );
    expect(abilityStepText('rescuer', 'touch')).toBe(
      '„Podaj”: Podaj teczkę – rzut do wolnej osoby',
    );
  });

  test('every role and device fits in 8 words', () => {
    const words = (text: string) =>
      text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
    for (const role of ROLES) {
      for (const device of DEVICES) {
        const text = abilityStepText(role, device);
        expect(words(text), text).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe('a whole tutorial run', () => {
  const basics: TutorialSignal[] = ['moved', 'pickedUp', 'minigameStarted', 'stampApplied'];

  beforeEach(() => {
    resetTutorial();
    useTutorial.setState({ step: null, hasRole: false, abilityUsed: false });
  });

  function run(hasRole: boolean, signals: readonly TutorialSignal[]): number | null {
    const store = useTutorial.getState();
    store.start(hasRole);
    for (const signal of signals) {
      useTutorial.getState().signal(signal);
    }
    return useTutorial.getState().step;
  }

  test('without a role it completes on the verdict', () => {
    expect(run(false, [...basics, 'verdict'])).toBe(TUTORIAL_DONE);
  });

  test('with a role the verdict leads to the ability step, the ability completes it', () => {
    expect(run(true, [...basics, 'verdict'])).toBe(ABILITY_STEP);
    useTutorial.getState().signal('abilityUsed');
    expect(useTutorial.getState().step).toBe(TUTORIAL_DONE);
  });

  test('a level where the ability cannot act skips the step it is waiting on', () => {
    expect(run(true, [...basics, 'verdict'])).toBe(ABILITY_STEP);
    useTutorial.getState().setHasRole(false);
    expect(useTutorial.getState().step).toBe(TUTORIAL_DONE);
  });

  test('an ability used early does not skip the basics, but skips its own step later', () => {
    expect(run(true, ['moved', 'abilityUsed'])).toBe(1);
    expect(run(true, ['pickedUp', 'minigameStarted', 'stampApplied', 'verdict'])).toBe(
      TUTORIAL_DONE,
    );
  });
});
