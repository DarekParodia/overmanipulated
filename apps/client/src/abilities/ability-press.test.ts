import { describe, expect, it } from 'bun:test';
import type { CrewSnapshot } from '@redakcja/shared';
import { abilityPressOutcome } from './ability-press.ts';

const member = (overrides: Partial<CrewSnapshot> = {}): CrewSnapshot => ({
  id: 'p1',
  abilityReadyAtMs: 0,
  abilityArmed: false,
  fieldCall: null,
  rescuesLeft: 0,
  ...overrides,
});

describe('ability press gate (S7-39)', () => {
  it('denies a press without a role or outside the crew', () => {
    expect(abilityPressOutcome({ role: null, member: member(), elapsedMs: 5000 })).toBe('denied');
    expect(abilityPressOutcome({ role: 'reporter', member: undefined, elapsedMs: 5000 })).toBe(
      'denied',
    );
  });

  it('sends a ready press, from the first moment of the level', () => {
    expect(abilityPressOutcome({ role: 'reporter', member: member(), elapsedMs: 0 })).toBe('send');
    expect(
      abilityPressOutcome({
        role: 'managingEditor',
        member: member({ abilityReadyAtMs: 70_000 }),
        elapsedMs: 70_000,
      }),
    ).toBe('send');
  });

  it('denies while cooling', () => {
    expect(
      abilityPressOutcome({
        role: 'photoEditor',
        member: member({ abilityReadyAtMs: 70_000 }),
        elapsedMs: 69_950,
      }),
    ).toBe('denied');
  });

  it('sends while armed or calling, so the server can disarm or cancel', () => {
    expect(
      abilityPressOutcome({
        role: 'archivist',
        member: member({ abilityArmed: true }),
        elapsedMs: 1000,
      }),
    ).toBe('send');
    expect(
      abilityPressOutcome({
        role: 'reporter',
        member: member({
          abilityReadyAtMs: 90_000,
          fieldCall: { folderId: 'f1', endsAtMs: 33_000 },
        }),
        elapsedMs: 30_000,
      }),
    ).toBe('send');
  });
});
