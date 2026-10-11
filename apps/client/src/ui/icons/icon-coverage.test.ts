// The "complete icon set" rule (design-rules §6): every story type, station, verdict, role, level
// event, ping and technique card resolves to an icon that exists in the set.
import { describe, expect, it } from 'bun:test';
import { TECHNIQUES } from '@redakcja/content';
import {
  LEVEL_EVENT_KINDS,
  PING_KINDS,
  ROLES,
  STATION_KINDS,
  storyTypeSchema,
  VERDICTS,
} from '@redakcja/shared';
import { cardIcon } from '../../encyclopedia/card-icons.ts';
import { EVENT_ICON } from '../../events/event-model.ts';
import { PING_ICON } from '../../pings/PingPicker.tsx';
import { STATION_ICON } from '../../stations/kit.tsx';
import { iconNames } from './Icon.tsx';
import { ROLE_ICON_NAMES } from './RoleIcon.tsx';

const known = new Set<string>(iconNames);

describe('icon coverage', () => {
  it('has an icon for every story type, station and verdict (the icon name is the id)', () => {
    for (const name of [...storyTypeSchema.options, ...STATION_KINDS, ...VERDICTS]) {
      expect(known.has(name)).toBe(true);
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

  it('gives every technique card an icon from the set', () => {
    for (const technique of TECHNIQUES) {
      expect(known.has(cardIcon(technique))).toBe(true);
    }
  });
});
