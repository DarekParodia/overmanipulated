// The "complete icon set" rule (design-rules §6): every story type, station, verdict, role, level
// event, ping and technique card resolves to an icon that exists in the set.
import { describe, expect, it } from 'bun:test';
import { TECHNIQUES } from '@redakcja/content';
import {
  ABILITIES,
  LEVEL_EVENT_KINDS,
  PING_KINDS,
  ROLES,
  STATION_KINDS,
  storyTypeSchema,
  VERDICTS,
} from '@redakcja/shared';
import { ABILITY_ICON, RESCUE_ICON } from '../../abilities/ability-icons.ts';
import { cardIcon } from '../../encyclopedia/card-icons.ts';
import { EVENT_ICON } from '../../events/event-model.ts';
import { PING_ICON } from '../../pings/PingPicker.tsx';
import { STATION_ICON } from '../../stations/kit.tsx';
import { ACCESSORIES } from '../../store/profile-model.ts';
import { ACCESSORY_ICON_NAMES } from './AccessoryIcon.tsx';
import { iconNames } from './Icon.tsx';
import { ROLE_ICON_NAMES } from './RoleIcon.tsx';

const known = new Set<string>(iconNames);

describe('icon coverage', () => {
  it('has an icon for every story type, station and verdict (the icon name is the id)', () => {
    for (const name of [...storyTypeSchema.options, ...STATION_KINDS, ...VERDICTS]) {
      expect(known.has(name)).toBe(true);
    }
  });

  it('draws all 10 stations, the four Stage 7 ones included (S7-48)', () => {
    expect(STATION_KINDS).toHaveLength(10);
    expect(Object.keys(STATION_ICON).sort()).toEqual([...STATION_KINDS].sort());
    for (const kind of ['geolocation', 'transcript', 'crossCheck', 'metadata']) {
      expect(known.has(kind)).toBe(true);
    }
  });

  it('maps every station, level event and ping to an existing icon', () => {
    for (const kind of STATION_KINDS) expect(known.has(STATION_ICON[kind])).toBe(true);
    for (const kind of LEVEL_EVENT_KINDS) expect(known.has(EVENT_ICON[kind])).toBe(true);
    for (const kind of PING_KINDS) expect(known.has(PING_ICON[kind])).toBe(true);
  });

  it('draws every role', () => {
    for (const role of ROLES) expect(ROLE_ICON_NAMES).toContain(role);
  });

  it('draws every accessory (S7-104)', () => {
    expect([...ACCESSORY_ICON_NAMES].sort()).toEqual([...ACCESSORIES].sort());
  });

  it('gives every ability and the rescue badge an icon from the set (S7-40)', () => {
    expect(Object.keys(ABILITY_ICON).sort()).toEqual([...ABILITIES].sort());
    for (const ability of ABILITIES) expect(known.has(ABILITY_ICON[ability])).toBe(true);
    expect(known.has(RESCUE_ICON)).toBe(true);
    for (const name of ['retry', 'pass', 'lifebuoy']) expect(known.has(name)).toBe(true);
  });

  it('gives every technique card an icon from the set', () => {
    for (const technique of TECHNIQUES) {
      expect(known.has(cardIcon(technique))).toBe(true);
    }
  });
});
