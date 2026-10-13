// S7-56: the minigame registry is complete. Every station kind has its own minigame, and a
// registry that leaves a kind out does not compile (the `@ts-expect-error` below fails
// `bun run typecheck` the day `MinigameRegistry` turns partial again).
import { describe, expect, it } from 'bun:test';
import { STATION_KINDS } from '@redakcja/shared';
import { minigameFor, minigames } from './index.ts';
import type { Minigame, MinigameRegistry } from './types.ts';

const Stub: Minigame = () => null;

// @ts-expect-error a registry without the other nine station kinds is a compile error
const partial: MinigameRegistry = { imageSearch: Stub };

describe('minigame registry', () => {
  it('has exactly one minigame per station kind', () => {
    expect(STATION_KINDS).toHaveLength(10);
    expect(Object.keys(minigames).sort()).toEqual([...STATION_KINDS].sort());
  });

  it('gives every kind its own component, with no shared stand-in', () => {
    const components = STATION_KINDS.map((kind) => minigameFor(kind));
    expect(new Set(components).size).toBe(10);
    expect(minigameFor('geolocation')).toBe(minigames.geolocation);
    expect(partial.imageSearch).toBe(Stub);
  });
});
