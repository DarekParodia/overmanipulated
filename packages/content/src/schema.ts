// Zod schemas for game content: stories (submissions) and levels. The authoring rules are in
// agents/content-authoring.md; this file is the authoritative model. Cross-file checks (story
// ids referenced by levels, solvability with the level's stations) live in checks.ts.
import {
  correctVerdictFor,
  parseLayout,
  prioritySchema,
  type SimLevel,
  type SimStory,
  stampRelevanceSchema,
  stationKindSchema,
  storyTypeSchema,
  truthSchema,
  verdictSchema,
} from '@redakcja/shared';
import { z } from 'zod';

export const HEADLINE_MAX = 80;
export const BODY_MAX = 200;
export const STAMP_TEXT_MAX = 120;

const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** `l<level>-<slug>`, e.g. `l1-zdjecie-powodzi`. Level 0 is the greybox test level. */
export const contentIdSchema = z
  .string()
  .regex(/^l\d+-[a-z0-9]+(-[a-z0-9]+)*$/, 'expected l<level>-<kebab-slug>');

/** Polish player-facing text: trimmed, non-empty. */
const text = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s === s.trim(), 'no leading or trailing whitespace');

export const stampSchema = z.object({
  id: z.string().regex(kebab),
  station: stationKindSchema,
  /** What the stamp says on the folder, e.g. „Zdjęcie znalezione w sieci w 2019 r.” */
  text: text(STAMP_TEXT_MAX),
  relevance: stampRelevanceSchema,
});

export const mediaSchema = z.object({
  kind: z.literal('image'),
  /** Path under apps/client/public/assets/. */
  src: z.string().min(1),
  alt: text(200),
  /** Who made it and under what licence (CC0, self-made, generated for the game). */
  credit: text(200),
});

export const debriefSchema = z.object({
  /** What the material really was. */
  what: text(400),
  /** How the manipulation works, in plain words. */
  technique: text(400),
  /** Which verification tool exposed it. */
  tool: text(300),
  /** A generic real-world analogue, without real names. */
  realWorld: text(400),
});

export const storySchema = z
  .object({
    id: contentIdSchema,
    type: storyTypeSchema,
    priority: prioritySchema,
    truth: truthSchema,
    correctVerdict: verdictSchema,
    headline: text(HEADLINE_MAX),
    body: text(BODY_MAX),
    /** Who sent it in, as shown on the folder („Post na grupie Nowe Brzegi Info”). */
    source: text(80),
    media: mediaSchema.optional(),
    stamps: z.array(stampSchema).min(1).max(6),
    justifyingStamps: z.array(z.string()).min(1),
    /** Manipulation technique id (encyclopedia entry), kebab-case; `none` for true stories. */
    technique: z.string().regex(kebab),
    debrief: debriefSchema,
    /** Subject-matter supervisor sign-off. */
    reviewed: z.boolean(),
  })
  .superRefine((story, ctx) => {
    const expected = correctVerdictFor(story.truth, story.priority);
    if (story.correctVerdict !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctVerdict'],
        message: `truth "${story.truth}" requires verdict "${expected}"`,
      });
    }
    const stampIds = new Set<string>();
    const stations = new Set<string>();
    story.stamps.forEach((stamp, i) => {
      if (stampIds.has(stamp.id)) {
        ctx.addIssue({ code: 'custom', path: ['stamps', i, 'id'], message: 'duplicate stamp id' });
      }
      if (stations.has(stamp.station)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stamps', i, 'station'],
          message: 'at most one stamp per station',
        });
      }
      stampIds.add(stamp.id);
      stations.add(stamp.station);
    });
    story.justifyingStamps.forEach((id, i) => {
      if (!stampIds.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['justifyingStamps', i],
          message: `unknown stamp "${id}"`,
        });
      }
    });
  });

export const spawnSchema = z.object({
  atS: z.number().nonnegative(),
  storyId: contentIdSchema,
  deadlineS: z.number().positive(),
});

const eventBase = { atS: z.number().nonnegative() };
const spawnEventBase = { ...eventBase, storyId: contentIdSchema, deadlineS: z.number().positive() };

/** Level events (S4-05..S4-09): see `folderTagSchema` for what each one does to folders. */
export const levelEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('viral'), ...spawnEventBase }),
  z.object({ kind: z.literal('bossCall'), ...spawnEventBase }),
  z.object({ kind: z.literal('correction'), ...spawnEventBase }),
  z.object({
    kind: z.literal('botRaid'),
    ...spawnEventBase,
    /** Near-identical folders in the wave. */
    count: z.number().int().min(2).max(6),
  }),
  z.object({
    kind: z.literal('outage'),
    ...eventBase,
    station: stationKindSchema,
    durationS: z.number().positive().max(60),
  }),
]);

export const levelSchema = z
  .object({
    id: contentIdSchema,
    /** Player-facing level name. */
    title: text(60),
    /** Editorial briefing shown before the level: topic of the day, new mechanics. */
    briefing: text(400),
    /** Topic of the day for the briefing card („Burza nad miastem”). */
    topic: text(40).optional(),
    /** Up to 3 short lines shown on the briefing card instead of a long `briefing` text. */
    briefingPoints: z.array(text(60)).min(1).max(3).optional(),
    durationS: z.number().int().positive(),
    /** Tile layout; legend in packages/shared/src/sim/map.ts. */
    layout: z.array(z.string().min(1)).min(3),
    stations: z.array(stationKindSchema).min(1),
    schedule: z.array(spawnSchema).min(1),
    /** Random events, sorted by `atS`. */
    events: z.array(levelEventSchema).default([]),
    stars: z.object({ two: z.number().int().positive(), three: z.number().int().positive() }),
  })
  .superRefine((level, ctx) => {
    let map: ReturnType<typeof parseLayout> | undefined;
    try {
      map = parseLayout(level.layout);
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['layout'], message: String(error) });
    }
    if (map) {
      const placed = new Set(map.fixtures.flatMap((f) => (f.station ? [f.station] : [])));
      level.stations.forEach((station, i) => {
        if (!placed.has(station)) {
          ctx.addIssue({
            code: 'custom',
            path: ['stations', i],
            message: `station "${station}" is not placed in the layout`,
          });
        }
      });
      for (const kind of ['conveyor', 'desk'] as const) {
        if (!map.fixtures.some((f) => f.kind === kind)) {
          ctx.addIssue({ code: 'custom', path: ['layout'], message: `layout has no ${kind}` });
        }
      }
      if (map.spawns.length < 4) {
        ctx.addIssue({ code: 'custom', path: ['layout'], message: 'layout needs 4 spawn points' });
      }
    }
    level.schedule.forEach((spawn, i) => {
      const previous = level.schedule[i - 1];
      if (previous && spawn.atS < previous.atS) {
        ctx.addIssue({ code: 'custom', path: ['schedule', i], message: 'schedule must be sorted' });
      }
      if (spawn.atS >= level.durationS) {
        ctx.addIssue({
          code: 'custom',
          path: ['schedule', i, 'atS'],
          message: 'spawns after the level ends',
        });
      }
    });
    level.events.forEach((event, i) => {
      const previous = level.events[i - 1];
      if (previous && event.atS < previous.atS) {
        ctx.addIssue({ code: 'custom', path: ['events', i], message: 'events must be sorted' });
      }
      if (event.atS >= level.durationS) {
        ctx.addIssue({
          code: 'custom',
          path: ['events', i, 'atS'],
          message: 'event after the level ends',
        });
      }
      if (event.kind === 'outage' && !level.stations.includes(event.station)) {
        ctx.addIssue({
          code: 'custom',
          path: ['events', i, 'station'],
          message: `station "${event.station}" is not in this level`,
        });
      }
    });
    if (level.stars.three <= level.stars.two) {
      ctx.addIssue({ code: 'custom', path: ['stars'], message: 'three stars must need more' });
    }
  });

export const storyFileSchema = z.array(storySchema);

/**
 * Encyclopedia card (S5-04): one manipulation technique. Stories name theirs in `technique`; the
 * card's `id` or one of its `aliases` must match, so near-duplicate ids share one collectible.
 */
export const techniqueSchema = z.object({
  id: z.string().regex(kebab),
  /** Other story technique ids that collect into this card. */
  aliases: z.array(z.string().regex(kebab)).default([]),
  name: text(40),
  /** How the trick works. */
  how: text(300),
  /** How to expose it: which stations and what to look for. */
  detect: text(300),
  /** Stations that help; the first one gives the card its icon. */
  stations: z.array(stationKindSchema).min(1).max(4),
  /** A generic real-world analogue, without real names. */
  realWorld: text(300),
  /** Teaser shown on the locked card; must not give the trick away. */
  hint: text(60),
});

export const techniqueFileSchema = z.array(techniqueSchema);
export type Technique = z.infer<typeof techniqueSchema>;

export type Stamp = z.infer<typeof stampSchema>;
export type Story = z.infer<typeof storySchema>;
export type Level = z.infer<typeof levelSchema>;

// Compile-time check: content types are usable wherever the simulation expects its views.
type Assignable<T, U> = T extends U ? true : false;
export const CONTENT_FITS_SIMULATION: [Assignable<Story, SimStory>, Assignable<Level, SimLevel>] = [
  true,
  true,
];
