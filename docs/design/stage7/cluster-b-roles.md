# Cluster B: Classes and active abilities (6 roles, station families, ability system end to end)

# S7-B: Roles and active abilities, implementation design

All paths are relative to `/home/user/overmanipulated`. I checked every `path:line` citation against the code on branch `claude/festive-thompson-yhfqfe` (commit a1f456c).

## 0. Verified current state (what this design replaces)

- **Role list.** `roleSchema = z.enum(['photoEditor','archivist','reporter','managingEditor'])` is at `packages/shared/src/domain.ts:25` and `ROLES` at `:52`.
- **Roles are passive only.**
  - `ROLE_WORK_TIME_FACTOR = 0.6` and `ROLE_STATIONS` are at `packages/shared/src/constants.ts:102-109`.
  - `workDurationMs` is at `packages/shared/src/sim/stations.ts:51-56` and is applied when work starts (`:144`).
  - The reporter's phone-queue skip is client-only (`apps/client/src/stations/StationOverlay.tsx:34-38`, then `minigames/types.ts:20-21`).
- **The old extension.**
  - `DEADLINE_EXTENSION_MS = 20_000` is at `constants.ts:89-90`.
  - The `extendDeadline` command is at `protocol.ts:119-120`.
  - `canExtendDeadline` is at `sim/desk.ts:168-177`, and its handler at `:260-279`. The handler sets the team-wide `GameState.deadlineExtensionUsed` (`sim/state.ts:61-62,110`), which also travels in the snapshot (`protocol.ts:211-212`, `apps/server/src/rooms/registry.ts:704`).
  - It emits `deadlineExtended` (`protocol.ts:241`).
  - On the client: the mirror is `apps/client/src/stations/deadline-extension.ts` (with its test). The `+20 s` button lives in `DeskOverlay.tsx`: `EXTEND` slot at `:45-47`, focus grid at `:138`, confirm at `:169-175`, the button at `:257-264`, and `useDeadlineExtension`/`ExtendDeadline` at `:359-447`. Its strings are `pl.desk.extend*` (`strings/pl.ts:362-365`). The cue routing is `fx/event-cues.ts:90-91`, `net/game-events.ts:131-136`, `fx/cues.ts:181-186` and `a11y/captions.ts:86`. The bot uses it at `tools/balance/bot.ts:576-593`.
- **Tick order is folders → stations → desk → pings → events → scoring** (`sim/step.ts:21-28`).
  - `checkDeadlines` deletes folders at the deadline (`sim/folders.ts:33-52`).
  - So an extension sent on the expiry tick arrives too late today.
- **Stale lobby note.** `Lobby.tsx:87` computes `noEditor` and `:175` shows the note `pl.lobbyRoles.noEditorNote` (`pl.ts:269`) even in 4-player rooms.
- **Reference pattern for a cooldown.** Pings keep `CrewMember.lastPingMs` (`state.ts:19-25`) and check `PING_COOLDOWN_MS` in `sim/pings.ts:6-20`. Commands are queued per player (`registry.ts:554-559`).
- **Input.**
  - Keyboard: `KEY_BINDINGS` (`input/keyboard.ts:4-12`); R is free.
  - Gamepad: `PAD` covers south, west and north only (`input/gamepad.ts`); RB (index 5) is free.
  - Latches: `input/input-manager.ts:15-16,46-53,89-106,113-153`. The ping latch is consumed in `net/runtime.ts:89-92`.
  - Overlays capture input. Keys become `NavIntent` through `NAV_KEYS` (`input/ui-nav.ts:12-29`), and the pad through `padIntents` (`:83-99`). The newest subscriber gets intents first. `StationOverlay` passes everything except `back` (`StationOverlay.tsx:91-98`).
- **Touch grid.** The template is `". ping" / "work interact"`, so the top-left cell is empty (`input/TouchControls.module.css:58-60`); mirrored, it is `"ping ." / "interact work"` (`:138-140`).
- **Station UI.**
  - `StationHost` keys a round as `${station.id}:${minigameSeed}` (`stations/StationLayer.tsx:43`).
  - It starts the lockout plate optimistically from the constant `MINIGAME_FAIL_LOCKOUT_MS` (`:49-57,79-87`).
- **Art and tests.**
  - Accessories: `scene/character/rig.ts:145-215`.
  - Clips: `controller.ts:163-190` and `role-clips.ts:267-300`.
  - Uniqueness tests: `character.test.ts:53-59` (vertex counts) and `animation-polish.test.ts:104-109` (fidget and celebration).
  - Icons: `ui/icons/RoleIcon.tsx:10-35`, with coverage checked in `icon-coverage.test.ts:35-36`.
- **Lobby picker.** Fixed 5-column grid (`screens/lobby/RolePasses.module.css:19-21`); 2 columns at 560 px or narrower (`:186-188`). e2e `pickRole` uses `getByRole('radio',{name})` (`e2e/helpers.ts:79-84`).
- **Tools.**
  - Contest cards: `tools/contest/cards.ts:46-75,124-125`.
  - Balance crews: `tools/balance/game.ts:29-35`.
  - Bot: phone queue for non-reporters at `bot.ts:553-560`; `usesExtension` at `models.ts:40`.
- **Station kinds per level** (levels/*.json):

  | Level | Stations |
  | --- | --- |
  | l0 | I, A, R |
  | l1 | I, R |
  | l2 | I, A, R |
  | l3 | I, R, A, P |
  | l4 | R, A, P, L |
  | l5 | I, S, R, P, A |
  | l6 | all six |

  Legend: I imageSearch, A archive, R sourceRegistry, P phone, S aiScanner, L dataLibrary. sourceRegistry is on every level.

## 1. Roles, families, perks

### Station families

There are three families. `STATION_FAMILY` (in constants) covers all 10 kinds:

| family id | Polish | stations |
| --- | --- | --- |
| `image` | Obraz | imageSearch, aiScanner, geolocation (Mapa), metadata (Metadane) |
| `documents` | Dokumenty | archive, dataLibrary, transcript (Stenogram) |
| `sources` | Źródła | sourceRegistry, phone, crossCheck (Inne media) |

**Who covers sourceRegistry and dataLibrary?**
- **sourceRegistry goes to the Reporter** (family `sources`). It is the SIFT "investigate the source" work, done with the phone and "find better coverage" (Inne media).
- **dataLibrary goes to the Archiwista** (family `documents`).

Why sourceRegistry is in `sources`: every level has sourceRegistry, and l0–l2 have no phone. Putting sourceRegistry in `documents` would leave the Reporter with no passive on l0–l2.

With this split the only levels where a specialist's passive does nothing are:
- l1 for the Archiwista (no archive, dataLibrary or transcript);
- l4 for the Fotoedytor (no image station).

Family share per level (image / documents / sources):

| Level | Image | Documents | Sources |
| --- | --- | --- | --- |
| l0 | 1 | 1 | 1 |
| l2 | 1 | 1 | 1 |
| l3 | 1 | 1 | 2 |
| l4 | 0 | 2 | 2 |
| l5 (with Stenogram + Metadane) | 3 | 2 | 2 |
| l6 (with Mapa + Inne media) | 3 | 2 | 3 |
| endless | 4 | 3 | 3 |

The station bag (cluster A) makes each station decide equally many folders, so family value grows with the family's station count.

### Roles

The English ids are final; add them as glossary rows.

| id | Polish | Passive | Active (R / RB / 4th touch button) |
| --- | --- | --- | --- |
| `photoEditor` | Fotoedytor | `image` hold ×0.6 | **Ekspertyza** (`expertise`): the next minigame at an `image` station is solved instantly |
| `archivist` | Archiwista | `documents` hold ×0.6 | **Ekspertyza** (`expertise`) for the `documents` family |
| `reporter` | Reporter | `sources` hold ×0.6; skips the phone queue (kept, client-side) | **Telefon z terenu** (`fieldCall`): the carried folder gets its phone stamp after a 6 s call while walking |
| `managingEditor` | Redaktor prowadzący | none | **Przedłużenie** (`extendDeadline`): +20 s to the carried folder, else the folder on the desk he operates, else the most urgent folder |
| `generalist` (NEW) | Wszechstronny | hold ×0.8 at every station | **Druga szansa** (`secondChance`): removes the lockout after a failed minigame and reopens the minigame at once, without the hold |
| `rescuer` (NEW) | Ratownik | **Koło ratunkowe** (`rescue`, passive): a folder that reaches its deadline in his hands gets +20 s (raid waves move together); once per level per Ratownik | **Podaj teczkę** (`passFolder`): the carried folder goes to the nearest free teammate within 6 tiles |

Roles stay optional and non-exclusive (Decision log, `implementation-plan.md:480`). Cooldowns are per player, so duplicate roles stack; see open points.

## 2. Contracts

### 2.1 `packages/shared/src/domain.ts`

```ts
export const roleSchema = z.enum(['photoEditor','archivist','reporter','managingEditor','generalist','rescuer']); // +2 in S7-B08
export const abilitySchema = z.enum(['expertise','fieldCall','extendDeadline','secondChance','passFolder']);
export const stationFamilySchema = z.enum(['image','documents','sources']);
/** armed: waits for its trigger (Ekspertyza, Druga szansa); started: Telefon z terenu dialling; done: effect applied. */
export const abilityStageSchema = z.enum(['armed','disarmed','started','done','cancelled']);
export const stampSourceSchema = z.enum(['minigame','expertise','fieldCall']);
export type Ability = z.infer<typeof abilitySchema>;            // + StationFamily, AbilityStage, StampSource
export const ABILITIES = abilitySchema.options; export const STATION_FAMILIES = stationFamilySchema.options;
```

### 2.2 `packages/shared/src/constants.ts`

**Removed:** `ROLE_WORK_TIME_FACTOR`, `ROLE_STATIONS` (`:102-109`) and `DEADLINE_EXTENSION_MS` (`:89-90`). `PROTOCOL_VERSION` goes 2 → 3; this is the single Stage 7 bump, shared with the other clusters.

```ts
// --- Stage 7 (S7-B): station families, role perks, abilities -------------------------------
export const STATION_FAMILY = {
  imageSearch: 'image', aiScanner: 'image',
  archive: 'documents', dataLibrary: 'documents',
  sourceRegistry: 'sources', phone: 'sources',
  // the stations cluster adds: geolocation 'image', metadata 'image', transcript 'documents', crossCheck 'sources'
} as const satisfies Record<StationKind, StationFamily>;

export type RolePerk = {
  /** Stations of this family take `familyWorkFactor` × the hold time; null = no family. */
  family: StationFamily | null;
  familyWorkFactor: number;
  /** Hold-time multiplier at every station outside the family. */
  otherWorkFactor: number;
  ability: Ability;
  skipsPhoneQueue: boolean;
  /** Ratownik's automatic rescues per level. */
  rescuesPerLevel: number;
};
export const ROLE_PERKS = {
  photoEditor:    { family: 'image',     familyWorkFactor: 0.6, otherWorkFactor: 1,   ability: 'expertise',      skipsPhoneQueue: false, rescuesPerLevel: 0 },
  archivist:      { family: 'documents', familyWorkFactor: 0.6, otherWorkFactor: 1,   ability: 'expertise',      skipsPhoneQueue: false, rescuesPerLevel: 0 },
  reporter:       { family: 'sources',   familyWorkFactor: 0.6, otherWorkFactor: 1,   ability: 'fieldCall',      skipsPhoneQueue: true,  rescuesPerLevel: 0 },
  managingEditor: { family: null,        familyWorkFactor: 1,   otherWorkFactor: 1,   ability: 'extendDeadline', skipsPhoneQueue: false, rescuesPerLevel: 0 },
  generalist:     { family: null,        familyWorkFactor: 1,   otherWorkFactor: 0.8, ability: 'secondChance',   skipsPhoneQueue: false, rescuesPerLevel: 0 },
  rescuer:        { family: null,        familyWorkFactor: 1,   otherWorkFactor: 1,   ability: 'passFolder',     skipsPhoneQueue: false, rescuesPerLevel: 1 },
} as const satisfies Record<Role, RolePerk>;

export const ABILITY = {
  expertise:      { cooldownMs: 60_000 },
  fieldCall:      { cooldownMs: 60_000, callMs: 6000 },
  extendDeadline: { cooldownMs: 60_000, addMs: 20_000 },
  secondChance:   { cooldownMs: 45_000, rangeTiles: 2.5 },
  passFolder:     { cooldownMs: 30_000, rangeTiles: 6, flightMs: 450 },
} as const satisfies Record<Ability, { cooldownMs: number }>;
/** Ratownik's Koło ratunkowe: time added to a folder that hits its deadline in his hands. */
export const RESCUE_ADD_MS = 20_000;
/** Abilities are first ready this long after the level (or a mid-game join) starts. */
export const ABILITY_FIRST_READY_MS = 0;
```

S7-B01 lands with the 4 existing roles only. S7-B08 adds the `generalist` and `rescuer` rows; the `satisfies` clause forces that.

### 2.3 `packages/shared/src/entities.ts`

```ts
export const fieldCallSchema = z.object({ folderId: id, endsAtMs: finite });
export const abilityStateSchema = z.object({
  /** Level time when the role's ability can be used again; ready when <= elapsedMs. */
  abilityReadyAtMs: finite,
  /** Ekspertyza / Druga szansa wait for their trigger. */
  abilityArmed: z.boolean(),
  /** Telefon z terenu in progress. */
  fieldCall: fieldCallSchema.nullable(),
  /** Ratownik: automatic rescues left this level (0 for other roles). */
  rescuesLeft: z.number().int().nonnegative(),
});
export type AbilityState = z.infer<typeof abilityStateSchema>;
// folderSchema gains:
  /** Time added by Przedłużenie / Koło ratunkowe; the speed bonus ignores it. */
  extendedMs: z.number().nonnegative().optional(),
```

### 2.4 `packages/shared/src/protocol.ts`

- **Commands (`:106-121`).** Remove `extendDeadline` and add `z.object({ kind: z.literal('useAbility') })`. There is no target: the server picks it with the shared `abilityPreview`.
- **Snapshot (`:199-213`).** Remove `deadlineExtensionUsed` and add:

  ```ts
  export const crewSnapshotSchema = abilityStateSchema.extend({ id: playerIdSchema });
  crew: z.array(crewSnapshotSchema).max(MAX_PLAYERS),
  ```

  Roles stay in `roomState.players` (they are fixed during play), so `crew` carries no role. It costs about 4 × 110 B per snapshot.
- **Events (`:215-302`).** Remove `deadlineExtended` (`:241`; its only producer is gone) and add:

  ```ts
  z.object({
    kind: z.literal('ability'),
    playerId: playerIdSchema,
    ability: abilitySchema,
    stage: abilityStageSchema,
    folderId: entityId.optional(),
    stationId: entityId.optional(),
    targetPlayerId: playerIdSchema.optional(),
    addedMs: finite.optional(),
    /** Only for stage 'cancelled' (Telefon z terenu). */
    reason: z.enum(['dropped', 'gone']).optional(),
  }),
  z.object({
    kind: z.literal('folderRescued'),
    playerId: playerIdSchema,
    folderId: entityId,
    addedMs: finite,
    /** Every folder that got the time (a botRaid wave moves together). */
    folderIds: z.array(entityId).min(1).max(8),
  }),
  ```

- **`minigameFailed` (`:252-257`)** gains `lockoutMs: finite`. It is 0 after Druga szansa, and the difficulty cluster will also scale it.
- **`stampApplied` (`:258-264`)** gains `via: stampSourceSchema`, which is required.

Invalid presses (cooldown, no target) are ignored by the server without an event. The client already knows why from the shared preview and plays a local "denied" cue.

### 2.5 `packages/shared/src/sim/state.ts`

- `CrewMember = { role: Role | null; workHeld: boolean; lastPingMs: number } & AbilityState`. The type is inferred from the schema, not written twice.
- `addPlayer(:124-146)` sets:
  - `abilityReadyAtMs: state.elapsedMs + ABILITY_FIRST_READY_MS`
  - `abilityArmed: false`
  - `fieldCall: null`
  - `rescuesLeft: role ? ROLE_PERKS[role].rescuesPerLevel : 0`
- Remove `deadlineExtensionUsed` (`:61-62`, `:110`).
- `removePlayer` already drops the carried folder; nothing more is needed there.

### 2.6 `SimContext` (`sim/frame.ts:8-13`)

Add an optional field: `absent?: ReadonlySet<string>`, the players whose connection dropped. The server fills it in `registry.ts:666-671` only when someone is disconnected. Podaj teczkę never targets them.

This shares a file with the difficulty cluster's `tuning` field. Both fields are optional, so the edits merge.

## 3. Simulation (`packages/shared/src/sim`)

### 3.1 New `sim/roles.ts` (pure)

```ts
export function abilityOf(role: Role | null): Ability | null;           // ROLE_PERKS[role].ability
export function roleWorkFactor(role: Role | null, kind: StationKind): number; // family → familyWorkFactor, else otherWorkFactor, null → 1
export function expertiseCovers(role: Role | null, kind: StationKind): boolean; // ability==='expertise' && STATION_FAMILY[kind]===perk.family
export function familyStations(family: StationFamily): StationKind[];   // STATION_KINDS filtered, used by lobby/cards
```

`workDurationMs` (`stations.ts:51-56`) becomes `Math.round(STATION_WORK_MS[kind] * roleWorkFactor(role, kind))`. The difficulty cluster later multiplies in `ctx.tuning.workFactor`.

### 3.2 New `sim/abilities.ts`

**Shared preview.** The same code runs in the sim, in the client HUD, in hints and in the bots:

```ts
export type AbilityView = {
  elapsedMs: number;
  players: Readonly<Record<string, { x: number; y: number; facing: number }>>;
  crew: Readonly<Record<string, { role: Role | null } & AbilityState>>;
  folders: Readonly<Record<string, Folder>>; stations: Readonly<Record<string, Station>>; desks: Readonly<Record<string, Desk>>;
};                                     // GameState satisfies it structurally
export type AbilityEnv = { map: TileMap; story(storyId: string): SimStory | undefined; absent?: ReadonlySet<string> };
export type AbilityBlockReason = 'noStation' | 'noFolder' | 'noStamp' | 'noPhone' | 'noTarget' | 'noFolders' | 'busy';
export type AbilityPreview =
  | { kind: 'none' }                                       // no role / not in crew
  | { kind: 'calling'; folderId: string; endsAtMs: number }
  | { kind: 'armed' }                                      // a press disarms
  | { kind: 'cooling'; readyAtMs: number }
  | { kind: 'blocked'; reason: AbilityBlockReason }
  | { kind: 'arm' }                                        // a press arms
  | { kind: 'now'; folderId?: string; stationId?: string; targetPlayerId?: string };
export function abilityPreview(view: AbilityView, playerId: string, env: AbilityEnv): AbilityPreview;
export function pickExtendTarget(view: AbilityView, playerId: string): string | null;
export function pickPassTarget(view: AbilityView, playerId: string, env: AbilityEnv): string | null;
export function extendFolders(state: GameState, folderId: string, addMs: number): { state: GameState; folderIds: string[] };
export function crewSnapshot(state: GameState): CrewSnapshot[];
export function stepAbilities(state: GameState, frame: SimFrame): GameState;
```

**Preview order** (first match wins):
1. `none`
2. `calling` (`fieldCall !== null`)
3. `armed`
4. `cooling` (`elapsedMs < abilityReadyAtMs`)
5. The per-ability rule:

| ability | `now` when | `arm` when | `blocked` otherwise |
| --- | --- | --- | --- |
| expertise | the player operates a station that `expertiseCovers`, in phase `minigame`, whose folder lacks the stamp `stampFor(kind)`, which exists | otherwise, if `state.stations` has at least one station of the family | `noStation` |
| fieldCall | carries folder F; some station has kind `phone`; F's story has a phone stamp not on F | (never) | `noFolder` / `noPhone` / `noStamp` |
| extendDeadline | `pickExtendTarget` ≠ null: the carried folder, else the folder on the desk the player operates, else the folder with the lowest `deadlineMs` (tie: lowest `spawnedAtMs`, then id) | (never) | `noFolders` |
| secondChance | the player operates no station or desk, and some station in `lockout` holding a folder is the faced station (`findInteractionTarget`), or is the nearest locked station within `ABILITY.secondChance.rangeTiles` | otherwise | (never) |
| passFolder | carries a folder and `pickPassTarget` ≠ null (rules below) | (never) | `noFolder` / `noTarget` |

`pickPassTarget` picks the nearest player who meets all of these; ties go to join order (`Object.keys(players)` order):
- not the passer and not in `env.absent`;
- carries no folder;
- operates no station or desk;
- distance ≤ `rangeTiles` = 6, with no line-of-sight check.

**`stepAbilities` (new first subsystem).** `SUBSYSTEMS = [stepAbilities, stepFolders, stepStations, stepDesk, stepPings, stepEvents, stepScoring]`, and the comment at `step.ts:17-20` is updated. Because it runs before `checkDeadlines`, a press or a rescue on the expiry tick still counts.

1. **Commands**, in arrival order: each `useAbility` runs `useAbility(state, frame, playerId)`:
   - `armed` → `abilityArmed = false`; event `{stage:'disarmed'}`.
   - `arm` → `abilityArmed = true`; event `{stage:'armed'}`. No cooldown yet: the cooldown starts when the effect happens.
   - `now` → `APPLY[ability]`. Each effect ends with `consume()`: `abilityArmed=false` and `abilityReadyAtMs = state.elapsedMs + ABILITY[a].cooldownMs`.
   - Any other preview is ignored. A second press in the same tick therefore sees `cooling`.
2. **Field calls** (`progressFieldCalls`). For every member with a `fieldCall`:
   - the folder is gone → event `{stage:'cancelled', reason:'gone'}`; the cooldown is not consumed;
   - the folder is no longer `carried` by this player → `{stage:'cancelled', reason:'dropped'}`;
   - `elapsedMs >= endsAtMs` → add the phone stamp if it is still missing, emit `stampApplied{stationId: <first phone station id>, via:'fieldCall'}`, then `ability{stage:'done', folderId}` and `consume()`. Either way, set `fieldCall = null`.
3. **Koło ratunkowe** (`rescueCarriedFolders`). For each folder with `deadlineMs <= elapsedMs` carried by player p with `crew[p].rescuesLeft > 0`:
   - The wave is the ids from `raidOfFolder(state, id)` that still exist, or just `[id]`.
   - `extendFolders(wave, RESCUE_ADD_MS)`, then `rescuesLeft -= 1`, then emit `folderRescued{folderId, playerId:p, addedMs:20000, folderIds}`.
   - This runs after the commands, so an editor's manual Przedłużenie on the same tick saves the Ratownik's charge.

**`APPLY` per ability:**
- **extendDeadline.** `extendFolders(state, folderId, 20_000)`. It extends the whole botRaid wave, because `expireRaids` (`events.ts:68-99`) would otherwise remove the extended sibling. For each folder: `deadlineMs += addMs`, `extendedMs = (extendedMs ?? 0) + addMs`, `warned = false`. Event `{stage:'done', folderId, addedMs:20000}`.
- **expertise (`now`).** `grantStamp(...)` adds the stamp, emits `stampApplied{via:'expertise'}` and sets the station to `idleStation`, releasing the operator. Event `{stage:'done', stationId, folderId}`. A late `minigameResult` from the overlay is then ignored, because the station is no longer operated.
- **fieldCall.** `crew.fieldCall = { folderId, endsAtMs: elapsedMs + 6000 }`; event `{stage:'started', folderId}`.
- **secondChance (`now`).** Draw `seed = drawMinigameSeed(state, folder, kind)`. This is a helper exported from `stations.ts`; today it is `nextInt(rng, 2^31-1)`, and the sourceRegistry stable-seed cluster plugs its "same card" map in there. Then:
  - set the station to `{ phase:'minigame', operatorId: playerId, minigameSeed: seed, lockoutMs: 0, progressMs: durationMs }`;
  - emit `minigameStarted`, then `ability{stage:'done', stationId, folderId}`.
- **passFolder.** Set `folder.location = { kind:'carried', playerId: target }`; event `{stage:'done', folderId, targetPlayerId}`. The 450 ms flight is purely visual (Decision log); there is no new folder location kind.

### 3.3 Hooks in `sim/stations.ts`

`stepStations` now also returns `crew`.

**working → minigame (`:171-187`).** Let `m = state.crew[operatorId]`. If all of these hold:
- `m.abilityArmed`
- `expertiseCovers(m.role, station.kind)`
- `stampId !== undefined` and the folder lacks it

then grant the stamp: emit `stampApplied{via:'expertise'}` and `ability{expertise, stage:'done', stationId, folderId}`, set the station to idle, `consume()`, and do not draw a seed. Otherwise the transition runs as today, with `drawMinigameSeed`.

**Failure branch (`:233-245`).**
- If `m.abilityArmed && abilityOf(m.role) === 'secondChance'`:
  1. draw a seed;
  2. the station stays `{phase:'minigame', operatorId, minigameSeed: seed, lockoutMs: 0}`, so `operators.delete` is skipped;
  3. emit `minigameFailed{lockoutMs:0}`, then `ability{secondChance, done}`, then `minigameStarted`;
  4. `consume()`.
- Otherwise behave as today and emit `minigameFailed{lockoutMs: MINIGAME_FAIL_LOCKOUT_MS}`.

The success path emits `stampApplied{via:'minigame'}`.

### 3.4 `sim/desk.ts`

- Delete `canExtendDeadline` (`:163-177`) and the `extendDeadline` case (`:260-279`), and update the header comment (`:4`).
- Speed bonus (`:98-99`):

  ```ts
  const baseDeadlineMs = folder.deadlineMs - (folder.extendedMs ?? 0);
  const totalMs = baseDeadlineMs - folder.spawnedAtMs;
  const speedBonus = baseDeadlineMs - nowMs > totalMs * SPEED_BONUS_REMAINING_FRACTION;
  ```

  This touches the same function that cluster A rewrites for multi-stamp verdicts; it is a two-line merge.

### 3.5 Server (`apps/server/src/rooms/registry.ts`)

- `broadcastSnapshot` (`:685-705`): replace `deadlineExtensionUsed` with `crew: crewSnapshot(game)`.
- Tick context (`:666-671`): add `absent`, built from `room.players` whose `connection === null` (only when the set is non-empty).
- `setRole` (`:390-397`) and mid-game `addToRoom` (`:241-248`) stay unchanged. A mid-game joiner has no role and has the ability state of `addPlayer`.

## 4. Client (`apps/client/src`)

### 4.1 Input

**Bindings:**
- `input/keyboard.ts`: `ability: ['KeyR']` (it joins `GAME_KEYS` automatically).
- `input/gamepad.ts`: `PAD.rb = 5`; `PadReading.ability = pressed(PAD.rb)`, which also counts towards `active`.

**`input/input-manager.ts`:**
- add `latched.ability` and `padPrevious.ability`;
- latch on keydown (no repeat) and on the pad edge;
- `touchInput.pressAbility()`;
- `InputSample.ability: boolean`, cleared while input is captured (as `ping` is).

**`input/ui-nav.ts`:**
- `NavIntent` gains `'ability'`;
- `NAV_KEYS.KeyR = 'ability'`;
- `padIntents` adds `'ability'` for `PAD.rb`;
- `input/menu-nav.ts` `handleMenuIntent` returns `false` for `'ability'` (like `'alt'`).
- Minigames ignore the unknown intent, because their `if` chains do nothing with it.

**`net/runtime.ts`:**
- `createRuntime(getLocalId, sendInput, sendCommand)` gets a third parameter, wired in `net/session.ts:60` as `(command) => send({ type: 'command', command })`.
- In `frame()`: `if (sample.ability && localKnown) onAbilityPress()`.
  - `onAbilityPress` reads the local preview (§4.2).
  - If the preview is `cooling`, `blocked` or `none`, it calls `emitCue('ability.denied')` and sends nothing.
  - Otherwise it sends `{kind:'useAbility'}`.

### 4.2 Preview on the client: new `apps/client/src/abilities/`

- **`ability-view.ts` (pure, tested).** `buildAbilityView(snapshot fields, roomPlayers, latestPlayers): AbilityView`. Positions come from `runtime.buffer.latest()?.players`, the local position from the predictor, roles from `useApp.room.players`, and crew from the new `useGame.crew`. The env is `{ map: runtime.map, story: getStory, absent: players with connected === false }`.
- **`use-ability.ts`.** `useAbilityPreview()` recomputes on each snapshot (`useGame(s => s.tick)`) and returns `{ role, ability, preview }`. A one-shot `getLocalAbilityPreview()` serves the runtime press check.
- **`ability-model.ts` (pure, tested).**

  ```ts
  export type AbilityChipModel = {
    ability: Ability;
    state: 'ready' | 'armed' | 'calling' | 'cooling' | 'blocked';
    ring: number; seconds: number | null; label: string; reason?: AbilityBlockReason;
  };
  export function abilityChipModel(preview: AbilityPreview, ability: Ability, elapsedMs: number): AbilityChipModel | null;
  ```

  - `cooling`: `seconds = ceil((readyAtMs - elapsedMs)/1000)` and `ring = 1 - (readyAtMs - elapsedMs)/ABILITY[a].cooldownMs`.
  - `calling`: `seconds = ceil((endsAtMs - elapsedMs)/1000)` and `ring = 1 - left/callMs`.
  - `ready`, `arm` and `now` all map to `ready` with `ring = 1`.
- **`ability-icons.ts`.** `ABILITY_ICON satisfies Record<Ability, IconName>`: expertise `bolt`, fieldCall `phone`, extendDeadline `hourglass`, secondChance `retry` (new), passFolder `pass` (new). New `Icon.tsx` paths: `retry`, `pass` and `lifebuoy`. `icon-coverage.test.ts` gains "every ability has an icon".
- **`ui/ProgressRing.tsx`.** Extracted from `WorkPrompt` (`StationOverlay.tsx:139-185`). Props: `progress`, `size`, `tone: 'work'|'ready'|'cooling'|'armed'|'call'`, and `children`. The tones map to token colours: ready = `--green`, cooling = `--surface-sunk` track with `--outline` fill, armed = `--blue`, call = `--orange`. `WorkPrompt` then uses it too.

### 4.3 HUD and touch: per-device behaviour

| Device | Where | Contents |
| --- | --- | --- |
| Keyboard / gamepad | `abilities/AbilityChip.tsx`, mounted in `hud/Hud.tsx` | Bottom-left, under `--hud-left`, at `bottom: max(var(--space-4), env(safe-area-inset-bottom))`. 64 px ring with the ability icon, or the seconds (≥ 30 px, `--font-display`). KeyCap `R` / `RB` (from `keyLabel(KEY_BINDINGS.ability[0])` and `'RB'`). Label ≤ 2 words. `data-testid="hud-ability"`, `data-state`. Hidden when the player has no role, and when touch controls show (`device==='touch' || isCoarsePointer()`). |
| Touch | `abilities/AbilityButton.tsx` in `input/TouchControls.tsx` | Grid `"ability ping" / "work interact"`, mirrored `"ping ability" / "interact work"`. Same 4.25 rem round size as ping (≥ 48 px). Ring around the edge; icon, or seconds while cooling or calling; short label `pl.touch.ability[a]`. `aria-disabled` while cooling or blocked, but still pressable (it gives the denied feedback). `onPointerDown`: `emitCue('ui.click')` + `touchInput.pressAbility()`. `data-testid="touch-ability"`. Not rendered without a role, so the cell stays empty and the layout is unchanged. |
| Ratownik (all devices) | — | Small lifebuoy badge with the count next to the chip or button; greyed out at 0. |

At 640×360 the touch cluster keeps its footprint, because the empty cell is reused. The bottom-left chip is never shown on phones, so it cannot collide with the joystick. The phone HUD pill rework (mobile cluster) is at the top and does not interact with this.

**Folder cards (`hud/FolderCard.tsx`):**
- `data-extended` plus a small "hourglass +20 s" mark when `extendedMs > 0`;
- `data-rescue` plus a lifebuoy badge when the folder is carried by a Ratownik with `rescuesLeft > 0`;
- `data-ability-target` (dashed blue outline) on the card the local editor's `now` preview targets.

This is coordinated with cluster A's "0/2" stamp badge on the same card.

**Design rules amended in the same commit (S7-B05):**
- §1.3 (`agents/design-rules.md:21`): "…time, points, credibility, up to 3 folders **and the player's own role chip (ability icon, cooldown ring, key)**".
- §5 (`:82-84`): "role chip bottom-left on keyboard/gamepad; on touch the 4th thumb button is the chip".

The ready state is green, not yellow, so the screen keeps one yellow primary action.

### 4.4 Overlays

**`StationOverlay.tsx`:**
- `skipsQueue = ROLE_PERKS[role].skipsPhoneQueue && station.kind === 'phone'` (replaces `:34-38`).
- When the preview is `now` with `stationId === station.id` and ability `expertise`: render a secondary "Ekspertyza" button with KeyCap through a new `OverlayFrame` prop `headerAction` (icon-only 48 px button at ≤ 760 px wide).
- On click, or on the `'ability'` intent in the frame listener at `:91-98` (which now handles `'back'` and `'ability'`): `settled.current = true`, `sendCommand({kind:'useAbility'})`, and show a `pl.station.expertiseSending` status.
- The overlay unmounts when the server idles the station.
- This button is the only way a phone player can use Ekspertyza mid-minigame, because the overlay is full-screen there.

**`StationLayer.tsx` `StationHost`:**
- (a) Add a `roundNonce` that increments on `minigameStarted` for the local player; `round = ${station.id}:${seed}:${nonce}`. This makes the overlay reopen when Druga szansa keeps the same operator and/or the stable sourceRegistry seed repeats.
- (b) Drop the optimistic `startLockout(MINIGAME_FAIL_LOCKOUT_MS)` in `onResult` (`:79-87`). The `minigameFailed` listener (`:49-57`) uses `event.lockoutMs` and ignores 0.

**`LockoutNote`.** When the local preview is secondChance `now` on the locked station, add a line "[R] Druga szansa" (pad: RB; touch: the ability icon pointing at the button). Hidden under Ekspert difficulty, because it is a hint.

**`DeskOverlay.tsx`:**
- Delete `EXTEND`/`EXTEND_RETRY_MS`, the focus slot, `useDeadlineExtension`, `ExtendDeadline`, and the `deadline-extension.ts` import.
- Handle the `'ability'` intent: for a managing editor with preview `now`, send `useAbility`. The server targets the desk folder, because the operator carries nothing.
- No new button (task requirement): touch editors use the thumb button before they open the sheet.
- Delete `stations/deadline-extension.ts` and its test.

### 4.5 World feedback

- **`abilities/AbilityMarkers.tsx`** (DOM overlay through `useOverlay` and `screenTransform`, like name tags in `PlayerAvatar.tsx:255-300`; at most 8 nodes, no draw calls):
  - an "armed" role badge over a player's head (blue ring);
  - a phone bubble with a draining ring while `fieldCall` runs;
  - for the local Ratownik who carries a folder with Podaj teczkę ready: a dashed ring under the `pickPassTarget` teammate.
- **`scene/Folders.tsx`:** on `ability{passFolder, done}`, record the arc `{folderId, from, to, start}`. For `ABILITY.passFolder.flightMs` (450 ms), draw the carried folder from the thrower's hand anchor to the receiver's, `y += 1.2 * 4t(1-t)`. Under reduced motion the folder snaps.
- **`scene/PlayerAvatar.tsx`** `onGameEvent` (pattern at `:233-250`):
  - `armed` / `done` (expertise, secondChance, extendDeadline) → `playUpper('abilityPower')`;
  - `fieldCall started` → `playUpper('abilityCall')`, a 6 s hand-to-ear clip; `cancelled`/`done` → the new `controller.stopUpper()`;
  - `passFolder done` → the thrower plays `playUpper('abilityThrow')` and the receiver plays `reachAt(...)`;
  - `folderRescued` → the hop is played by the cue.
- **`role-clips.ts`:** add `ABILITY_CLIPS = ['abilityPower','abilityThrow','abilityCall']` to `UPPER_CLIPS`. The existing test already requires that upper clips do not touch legs or hips.

### 4.6 Cues, captions, sounds (`fx/cues.ts`, `fx/event-cues.ts`, `a11y/captions.ts`, `agents/game-feel.md`)

`cueForEvent` gains a `localPlayerId` parameter and returns `CueId | null`: it returns `null` for another player's `armed`/`disarmed`. `game-events.ts` skips `null`, adds context cases for `ability` and `folderRescued` (position at the folder, the station, or the player for `fieldCall`), and uses the player position for `stampApplied` with `via === 'fieldCall'`.

| Cue | Trigger | Sound (bus) | Particles / anim | Haptic | Caption (≤ 3 words) |
| --- | --- | --- | --- | --- | --- |
| `ability.ready` | local crew `cooling` → ready (client-derived) | `abready` (ui, 0.6) | HUD/touch `abilityReady` bump | tick | `bolt` 'Zdolność gotowa' (scope local) |
| `ability.denied` | local press while blocked or cooling | `back` (ui) | `abilityDenied` chip shake (not under reduced motion) | tick | skip own-action |
| `ability.armed` | `ability` armed | `abpower` (sfx, 0.5) | inkPuff in player colour | tick | `bolt` 'Zdolność uzbrojona' (local) |
| `ability.disarmed` | disarmed | `back` (sfx, 0.4) | — | — | skip own-action |
| `ability.expertise` | expertise done | `abpower` (sfx, 0.8) | starBurst + inkPuff | success | `bolt` 'Ekspertyza!' good |
| `ability.call.start` | fieldCall started | `ping3` (sfx, 0.7) | — | tick | `phone` 'Telefon z terenu' info |
| `ability.call.done` | fieldCall done (`stamp.applied` also fires) | — | paperBits | — | `phone` 'Pieczątka z terenu' good |
| `ability.call.dropped` | fieldCall cancelled | `fail` (sfx, 0.5) | — | — | `phone` 'Rozmowa przerwana' warn (local) |
| `ability.extendDeadline` | extendDeadline done (replaces `folder.deadlineExtended`) | `arrive` (sfx, 0.6) | paperFlutter ×6, `['hop','cardHop']` | success | `hourglass` 'Więcej czasu' good |
| `ability.secondChance` | secondChance done | `evback` (sfx, 0.5) | sparks ×6 | tick | `retry` 'Druga szansa' good |
| `ability.pass` | passFolder done | `abthrow` (sfx) | paperFlutter ×3 | tick | `folder` 'Teczka podana' info |
| `role.rescue` | `folderRescued` | `evclear` (sfx, 0.8) | starBurst, `['hop','cardHop']`, shake 0.15 | success | `lifebuoy` 'Teczka uratowana!' good |

- New `AnimationTrigger`s: `abilityReady` and `abilityDenied` (HUD, through `useHudTrigger`).
- New sprite ids appended to `SOUNDS` in `tools/audio/synth_placeholders.py`: `abready` (two rising soft ticks), `abpower` (short rising sparkle), `abthrow` (paper whoosh). Then regenerate the sprite and `measure.py`, and add an "Abilities" line to `docs/audio.md`.
- Mute, reduced motion and no-flash are respected through the existing layers. Ring "pulses" are static under no-flash.

### 4.7 Lobby role picker (`screens/lobby/RolePasses.tsx` + css)

**Options:** `[...ROLES, 'none']`, 7 in all, as native radios (`aria-labelledby` = name, `aria-describedby` = a visually hidden passive + active line). e2e `pickRole` works unchanged.

**Layout:**
- **Desktop:** `.grid` is `repeat(7, minmax(0,1fr))` with compact cards: icon 3 rem, name in `--text-md`, at most 2 lines.
- **Below the grid, a detail panel** for the checked role, or the hovered one on pointer devices. It shows:
  - RoleIcon and name;
  - the passive line with family station chips filtered to the level's stations;
  - the active line: KeyCap for the device (`R` / `RB` / `Przycisk`), ability name and what it does (≤ 8 words), and "co 60 s".
- **At max-width 1000 px:** `repeat(4, …)`.
- **640×360** (`max-height:520px` landscape): `repeat(4, …)`, with row cards (2.25 rem icon beside the name). That gives 2 rows of about 44 px plus a 2-line detail panel; the lobby scrolls with a sticky action bar (`Lobby.module.css:131-170`).
- **At max-width 560 px:** 2 columns.
- **Team dots:** each card shows the `PlayerMark` dots of teammates who chose it, a "team covers" cue. Roles are non-exclusive, so there is no "taken" state.

**Pure `screens/lobby/role-summary.ts`:**

```ts
export function roleSummary(role: Role, levelStations: readonly StationKind[]): {
  passive: string | null; ability: { name: string; what: string; cooldownS: number };
  stations: StationKind[]; passiveUseful: boolean; abilityUseful: boolean;
};
```

- `abilityUseful` is false for:
  - `fieldCall` without `phone`;
  - `expertise` with no family station.
- Under the panel, for the local player only:
  - `pl.lobbyRoles.passiveNotHere` when the passive is useless on this level;
  - else `pl.lobbyRoles.abilityNotHere` when the ability is.

`Lobby.tsx`:
- passes `levelStations`, from `getLevel(levelId)?.stations`, with `ENDLESS_STATIONS` for endless;
- deletes `noEditor` (`:87`) and `showEditorNote` (`:175`);
- removes `pl.lobbyRoles.noEditorNote`.

`roleBonus` is derived from `ROLE_PERKS`, so the card never contradicts the sim.

### 4.8 Guidance, tutorial, settings

**`guidance/next-step.ts`.** `NextStepInput` gains `ability?: { ability: Ability; preview: AbilityPreview; key: string }`. New kind `'ability'`, added to `HERE_KINDS`:
- carried folder ≤ `DEADLINE_WARNING_MS` left and an editor `now` → `hint.abilityExtend(key)`;
- carrying with `'phone'` in `stationsToVisit` and a reporter `now` → `hint.abilityCall(key)`;
- `lockout` step and a generalist `now` → `hint.abilitySecond(key)`.

The Ekspert difficulty hides the whole Guidance (difficulty cluster).

**`guidance/tutorial.ts`.** `TUTORIAL_STEPS` gains `'ability'` (6th). A new signal `'abilityUsed'` comes from `ability` events of the local player with stage armed, started or done. `skipAbilityStep(stepIndex, hasRole)` jumps to `TUTORIAL_DONE` for players without a role. The card shows the RoleIcon plus `tutorial.ability(key, name, what)`.

The intro (decision 7) uses the `pl.roles` strings for its "Role i zdolności" slide; that is coordination only.

**Settings.**
- `screens/settings-model.ts`: `ControlAction` gains `'ability'`, with rows keyboard `[['R']]`, gamepad `[['RB']]` (`PAD_FACE[PAD.rb]='RB'`), touch `[[pl.touch.abilityGeneric]]`.
- `pl.settings.actions.ability = 'Zdolność roli'`.
- `SettingsTabs.tsx` `TouchPreview` (`:145-171`) gains a 4th `pvAbility` button in the same grid cell.
- `agents/platforms.md` controls table (`:23-29`) gains the row "Role ability | R | RB / R1 | 4th button (role icon)".

### 4.9 Strings (`strings/pl.ts`; render through `typeset()`; non-breaking space after one-letter words)

```ts
vocab.roles += { generalist: 'Wszechstronny', rescuer: 'Ratownik' }
vocab.abilities = { expertise: 'Ekspertyza', fieldCall: 'Telefon z terenu', extendDeadline: 'Przedłużenie', secondChance: 'Druga szansa', passFolder: 'Podaj teczkę' } satisfies Record<Ability,string>
vocab.families = { image: 'Obraz', documents: 'Dokumenty', sources: 'Źródła' } satisfies Record<StationFamily,string>
vocab.rescue = 'Koło ratunkowe'
touch.ability = { expertise: 'Ekspert', fieldCall: 'Dzwoń', extendDeadline: '+20 s', secondChance: 'Szansa', passFolder: 'Podaj' }; touch.abilityGeneric = 'Zdolność'
lobbyRoles: familyFaster(f, p) => `${f}: praca o ${p}% szybciej`; everywhereFaster(p) => `Wszędzie praca o ${p}% szybciej`;
  phoneQueue: 'Telefon bez kolejki'; rescuePassive(s) => `Raz ratuje teczkę w ręce (+${s} s)`;
  abilityWhat: { photoEditor: 'zadanie przy obrazie od razu', archivist: 'zadanie przy dokumentach od razu', reporter: 'pieczątka Telefonu bez chodzenia', managingEditor: '+20 s dla teczki w ręce lub najpilniejszej', generalist: 'po pudle od razu jeszcze raz', rescuer: 'rzut do najbliższej wolnej osoby' } satisfies Record<Role,string>;
  cooldown(s) => `co ${s} s`; passiveNotHere: 'Twoja premia nie działa na tym poziomie.'; abilityNotHere: 'Twoja zdolność nie działa na tym poziomie.';  (noEditorNote removed)
hud.ability = { ready: 'Gotowa', armed: 'Uzbrojona', calling: 'Dzwonię…', seconds: (s) => `${s} s`,
  blocked: { noStation: 'Nie tutaj', noFolder: 'Weź teczkę', noStamp: 'Bez Telefonu', noPhone: 'Brak Telefonu', noTarget: 'Nikt wolny', noFolders: 'Brak teczek', busy: 'Zajęty' },
  label: (name, status) => `${name}: ${status}`, rescueReady: 'Koło ratunkowe gotowe', rescueUsed: 'Koło ratunkowe zużyte', extended: (s) => `+${s} s` }
station.expertise = 'Ekspertyza'; station.expertiseSending = 'Ekspertyza…'; station.secondChance = 'Druga szansa'
guidance.hint += { abilityExtend: (k) => `${k}: +20 s dla teczki`, abilityCall: (k) => `${k}: zadzwoń z terenu`, abilitySecond: (k) => `${k}: druga szansa` }
guidance.tutorial.ability = (k, name, what) => `${k}: ${name} – ${what}`   // e.g. 'R: Ekspertyza – zadanie przy obrazie od razu'
settings.actions.ability = 'Zdolność roli'
a11y.captions += abilityReady 'Zdolność gotowa', abilityArmed 'Zdolność uzbrojona', expertise 'Ekspertyza!', callStarted 'Telefon z terenu', callStamp 'Pieczątka z terenu', callDropped 'Rozmowa przerwana', secondChance 'Druga szansa', folderPassed 'Teczka podana', rescued 'Teczka uratowana!'  (moreTime reused)
desk.extend / extendAmount / extendLabel / extended → removed
```

## 5. Art (S7-B08)

**`RoleIcon.tsx`** (24×24, 2.5 px strokes):
- `generalist`: a multi-tool (open pocket knife with a pencil blade and a loupe ring);
- `rescuer`: a lifebuoy (two concentric circles with 4 band strokes, `tint` fill).

**`rig.ts` `accessoryParts`:**
- `generalist`: a tool belt. A flattened `TorusGeometry(0.27, 0.03, 4, 16)` at the hips in `colors.furniture`, plus 3 `box(0.08, 0.09, 0.06)` pouches.
- `rescuer`: a lifebuoy worn across the back and side, `TorusGeometry(0.15, 0.05, 6, 14)` in `colors.red`, plus a whistle (`CylinderGeometry(0.02, 0.025, 0.07, 6)` on a thin lanyard torus).
- Both get vertex counts distinct from the 5 existing ones; verified by the `character.test.ts:53-59` loop, which now covers 7 entries.

**`role-clips.ts` + `controller.ts`:**
- `idleGeneral`: twirls a pencil, looks around;
- `idleRescuer`: shades its eyes, scans the room;
- `cheerGeneral`: two thumbs up on both hops;
- `cheerRescuer`: an arm swing as if throwing the ring, then a V.

They are added to `FIDGET_CLIPS`, `CELEBRATION_CLIPS`, `roleClips()`, `fidgetForRole` and `celebrationForRole`; `animation-polish.test.ts:104-109` stays green. `PlayerCard`, `Styleguide` and `ROLE_ICON_NAMES` pick the new roles up automatically.

## 6. Tools

### Balance (`tools/balance`)

**Crews.** `game.ts` `ROLES_BY_CREW`:

| Crew size | Roles |
| --- | --- |
| 1 | `['generalist']` |
| 2 | `['reporter','photoEditor']` |
| 3 | `['reporter','photoEditor','archivist']` |
| 4 | `['reporter','photoEditor','archivist','managingEditor']` |

A new `--roles <preset|list>` flag in `run.ts` accepts the presets `mixed`, `rescue` (`…,'rescuer'`) and `generalists`. `RunResult` gains `abilities: Partial<Record<Ability, number>>` and `rescues: number`.

**`bot.ts`:**
- replace `maybeExtend` (`:576-593`) and `extensionUser` (`:98,107`) with `maybeUseAbility(state, ctx, out)`, gated by `abilityPreview`;
- the phone queue uses `ROLE_PERKS[role].skipsPhoneQueue` (`:559`).

Bot policies:

| Ability | Bot behaviour |
| --- | --- |
| extendDeadline | A claimed folder has < `EMERGENCY_MS` left and the preview `now` targets it. |
| expertise, secondChance | Arm whenever `arm` is shown. |
| fieldCall | When the next planned station is `phone` and the preview is `now`: send it, then a new phase `calling` holds the folder and walks to the desk or waits until the stamp arrives (watchdog `callMs` + 1 s). |
| passFolder | Not used; this is documented as a limitation. |

**Models.** `models.ts`: `usesExtension` → `usesAbility` (0 / 0.5 / 1).

**Tuning.** Run `bun run balance`. If the 4-player average crew's 3-star rate goes above the docs/balance.md targets, raise the `extendDeadline` cooldown to 75 s first.

### Contest (`tools/contest/cards.ts`)

- `ROLE_INFO` gains `generalist` ("Pomoc tam, gdzie właśnie jest kolejka.", tip "Jeden dowód to mało? Sprawdź drugim narzędziem.") and `rescuer` ("Pilnowanie terminów i podawanie teczek.", tip "Pośpiech sprzyja manipulacji. Zyskaj czas, zanim zdecydujesz.").
- `bonusLine` comes from `ROLE_PERKS`, plus a new "Zdolność" section (R / RB / przycisk, cooldown).
- Station chips come from `familyStations`.
- The sheet becomes 2 A4 landscape pages (4 + 2) with `break-after: page`, card height 440 px, zoom 0.74.

## 7. Interactions

- **Versus (one newsroom per team).** Abilities, cooldowns, rescues and pass targets live inside each team's `GameState`, so they are per team automatically. If the versus cluster instead puts both teams in one state, `AbilityEnv` gains `teamOf?(id)` and `pickPassTarget`/`pickExtendTarget` filter by team. Ekspertyza is resolved on the server, so it adds no new trust surface for versus.
- **Spectators.** They read `snapshot.crew` (ability state for each player) and the `ability`/`folderRescued` events for the live feed and per-player stats.
- **Difficulty.** Abilities are unchanged across difficulties in v1. `workDurationMs = base × roleWorkFactor × tuning.workFactor`. `minigameFailed.lockoutMs` carries the scaled lockout. Ekspert hides the next-step and LockoutNote ability hints; the chip stays.
- **Station-bag cluster.** Family value follows the level's station mix (§1).
- **New-stations cluster.** It must add 4 `STATION_FAMILY` entries, compile-enforced.
- **sourceRegistry no-reroll cluster.** Shares `drawMinigameSeed` and benefits from the `StationHost` round nonce.

## 8. Tests (literal values)

### `packages/shared/src/sim/roles.test.ts`

| Call | Expected |
| --- | --- |
| `roleWorkFactor('photoEditor','imageSearch')` | 0.6 |
| `roleWorkFactor('photoEditor','archive')` | 1 |
| `roleWorkFactor('reporter','sourceRegistry')` | 0.6 |
| `roleWorkFactor('archivist','sourceRegistry')` | 1 |
| `roleWorkFactor('archivist','dataLibrary')` | 0.6 |
| `roleWorkFactor('generalist','phone')` | 0.8 |
| `roleWorkFactor('managingEditor','phone')` | 1 |
| `roleWorkFactor(null,'archive')` | 1 |
| `workDurationMs`: photoEditor at imageSearch | 2400 |
| `workDurationMs`: reporter at phone | 3600 |
| `workDurationMs`: reporter at sourceRegistry | 2400 |
| `workDurationMs`: generalist at archive | 4000 |
| `workDurationMs`: archivist at dataLibrary | 3000 |

Also: `expertiseCovers('archivist','dataLibrary') === true` and `expertiseCovers('archivist','sourceRegistry') === false`. Update `stations.test.ts:202-212,471`.

### `packages/shared/src/sim/abilities.test.ts`

Tests drive `stepAbilities` and `stepStations` directly with a frame, and `step()` for ordering.

1. **`addPlayer` state.** `addPlayer(..., 'rescuer')` gives `{abilityReadyAtMs:0, abilityArmed:false, fieldCall:null, rescuesLeft:1}`; reporter gets `rescuesLeft:0`.
2. **Przedłużenie.** Editor at elapsed 10 000; f1 on a table, deadline 50 000. Pressing gives deadline 70 000, `extendedMs` 20 000, `warned` false, event `{kind:'ability',ability:'extendDeadline',stage:'done',folderId:'f1',addedMs:20000}`, and readyAt 70 000. A press at 69 950 does nothing; a press at 70 000 works.
3. **Target priority.** Carried f2 (deadline 50 000) beats f1 (deadline 30 000), so f2 is extended. With nothing carried, f1 is extended. Folder on the operated desk beats the most urgent folder.
4. **Raid wave.** raid1 = f1, f2, f3: Przedłużenie on f2 gives all three +20 000.
5. **Expiry tick.** f1 deadline 20 000; `step()` from elapsed 19 950 with `useAbility`: f1 survives with deadline 40 000 and there is no `folderExpired`.
6. **Rescue.** Rescuer carries f1 with deadline equal to elapsed: `folderRescued{addedMs:20000,folderIds:['f1']}`, deadline +20 000, `rescuesLeft` 0. At the next deadline it gets `folderExpired`. No rescue for a folder on a table, for a non-rescuer, or with `rescuesLeft` 0. Editor press and rescue on the same tick: the editor's extension is applied and `rescuesLeft` stays 1.
7. **Ekspertyza arm / consume.**
   - photoEditor not operating: `armed` event and armed = true; a second press gives `disarmed`.
   - Armed photoEditor holds work at `imageSearch-0` for 2400 ms: no `minigameStarted`; `stampApplied{via:'expertise'}`; station idle; armed false; readyAt = elapsed + 60 000.
   - Armed photoEditor at `archive-0`: normal `minigameStarted`, still armed.
   - In `minigame` phase: a press grants the stamp immediately.
8. **Telefon z terenu.** Map has `phone-0`; reporter carries f1 whose story has `s-phone`.
   - Press gives `started`; after 120 ticks (6000 ms) `stampApplied{stationId:'phone-0',via:'fieldCall'}` then `done`, and readyAt = completion + 60 000.
   - Putting the folder down at tick 10 gives `cancelled{reason:'dropped'}` and no cooldown.
   - Ignored when the level has no phone, the story has no phone stamp, or the stamp is already on the folder.
9. **Druga szansa.**
   - Immediate: `archive-0` in lockout 3000 with a folder; generalist facing it → phase `minigame`, operator generalist, `lockoutMs` 0, `minigameStarted` emitted, readyAt +45 000.
   - Armed: the generalist fails → `minigameFailed{lockoutMs:0}`, then `ability done`, then `minigameStarted`; same operator; armed false.
   - Without it: `minigameFailed{lockoutMs:3000}`.
10. **Podaj teczkę.** Rescuer at (2.5, 2.5) carries f1; p2 at (5.5, 2.5) is free; p3 at (3.5, 2.5) carries a folder. Result: f1 carried by p2, event `targetPlayerId:'p2'`, readyAt +30 000. When everyone is beyond 6 tiles, operating, or in `absent`: no event and no change. A tie goes to join order.
11. **Ignored presses.** No role; or `cooling` (second press within the cooldown) → state identical (`toBe`).
12. **Speed bonus.** Spawned 0, deadline 60 000 → 80 000 with `extendedMs` 20 000; verdict at 35 000 gives `speedBonus` false (25 000 left < 30 000).
13. **`abilityPreview` table per role.** Literal previews, e.g. a reporter on an l1 map → `{kind:'blocked',reason:'noPhone'}`.

### Other unit and protocol tests

- **`protocol.test.ts`.** Parses `useAbility`; rejects `extendDeadline`; parses every `ability` stage, `folderRescued`, `crew` in the snapshot, `minigameFailed.lockoutMs` and `stampApplied.via`. Snapshot fixtures change at `:13`, `:126` and `:192`.
- **`desk.test.ts`.** Delete the extension tests (`:370-415`).

### Server: `apps/server/src/rooms/registry.test.ts`

New test: "resolves useAbility next tick and reports the cooldown in crew".
1. Host `setRole` managingEditor, then `startPastBriefing`.
2. Tick 60 times, so l0 f1 spawns at 3000 with deadline 93 000.
3. Send `{type:'command',command:{kind:'useAbility'}}` and tick.
4. Expect the event `{kind:'ability',ability:'extendDeadline',stage:'done',folderId:'f1',addedMs:20000}`, f1 `deadlineMs` 113 000 and `extendedMs` 20 000, and `crew[0].abilityReadyAtMs === elapsedMs + 60000`.

### Client

- **Input.** `KEY_BINDINGS.ability` is `['KeyR']`; `readGamepad` with button 5 gives `ability:true`; `NAV_KEYS.KeyR === 'ability'`.
- **`settings-model.test`.** The ability rows are keyboard `[['R']]`, gamepad `[['RB']]`, touch `[['Zdolność']]`.
- **`ability-model.test`.**
  - extendDeadline, readyAt 40 000, elapsed 17 000 → `{state:'cooling', seconds:23}` and ring ≈ 0.617.
  - calling, endsAt 10 000, elapsed 7000 → seconds 3, ring 0.5.
  - `now` → `ready`, ring 1.
- **`ability-view.test`.** Builds the view from snapshot fixtures.
- **`role-summary.test`.**
  - reporter on `['imageSearch','sourceRegistry']` → stations `['sourceRegistry']`, `passiveUseful` true, `abilityUseful` false.
  - photoEditor on l4 → both false.
  - generalist → both true.
- **Event and caption tests.** `fx.test.ts:219`: replace `deadlineExtended` with every new event; each maps to a cue, and a remote player's `armed` maps to `null`. The captions exhaustive check compiles.
- **Icons and art.** `icon-coverage`: every ability and role is covered. `character.test` and `animation-polish.test` cover 6 roles.
- **Tutorial and next-step.** `tutorial.test`: the ability step is skipped without a role and completes on the local `ability` armed event. `next-step.test`: an editor carrying a warned folder gets the hint 'R: +20 s dla teczki'.

### e2e

- **`e2e/multiplayer.spec.ts:92-95`.** Also `pickRole(host,'Ratownik')` and check that the roster shows 'Ratownik'.
- **New `e2e/abilities.spec.ts`.**
  - Desktop: pick 'Redaktor prowadzący', start l0, skip the briefing, and wait until `[data-folder]` and `hud-ability[data-state=ready]` show. Press `r`. Expect `data-state=cooling`, `[data-extended]` on a card, and the caption 'Więcej czasu'.
  - Mobile: pick 'Ratownik', start; `touch-ability` is visible with text 'Podaj' and `data-state=blocked`.

## 9. Docs

- **`agents/glossary.md`.**
  - Roles table (`:63-70`): rewrite all 6 rows (Polish name / id / passive / active).
  - New tables: "Abilities (`Ability`)" with Ekspertyza, Telefon z terenu, Przedłużenie, Druga szansa, Podaj teczkę and Koło ratunkowe (`rescue`, passive); "Station families (`StationFamily`)" with Obraz, Dokumenty, Źródła.
  - New terms: zdolność = ability, odnowienie = cooldown, uzbrojona = armed.
  - Fix the heading `StationId` → `StationKind` (`:52`).
- **`docs/design-document.pl.md`.** Rewrite the role table (`:37-46`) with columns Rola | Premia | Zdolność (R / RB / przycisk) | Typowe zadanie. Delete the 3-player rule (`:46`). Under "Sterowanie", add "R to zdolność roli".
- **`docs/implementation-plan.md`.**
  - Under Stage 7, add "### S7-B — Roles and abilities" listing S7-B01…B12.
  - Mark S4-04 as superseded.
  - Decision log rows:
    1. Active abilities: `useAbility`, server-chosen targets, shared `abilityPreview`, per-player cooldowns.
    2. Station families, with sourceRegistry in Reporter's `sources`.
    3. The once-per-level extension and the ≤ 3-player rule are replaced by Przedłużenie (60 s cooldown). Supersedes `:491`.
    4. The Podaj teczkę flight is cosmetic.
    5. Druga szansa also skips the re-hold.
    6. `extendedMs` and the speed bonus on the base deadline.
    7. `stepAbilities` runs first.
    8. Invalid presses produce no event.
- **Others.**
  - `agents/game-feel.md`: rows from §4.6, replacing `folder.deadlineExtended` (`:72`, `:96`).
  - `agents/design-rules.md`: §1.3 and §5 (see §4.3).
  - `agents/platforms.md`: controls row.
  - `docs/audio.md`: the new sound ids.
  - `docs/balance.md:29`: crews, ability policies and results.

## 10. Critical files

- `packages/shared/src/sim/abilities.ts` (new)
- `packages/shared/src/sim/stations.ts`
- `packages/shared/src/protocol.ts`
- `packages/shared/src/constants.ts`
- `apps/client/src/abilities/*` (new)
- `apps/client/src/input/TouchControls.tsx`
- `apps/client/src/stations/StationLayer.tsx`
- `apps/client/src/screens/lobby/RolePasses.tsx`

## Contract changes

- packages/shared/src/constants.ts: PROTOCOL_VERSION 2→3. This is the single Stage 7 bump shared with the other clusters: whoever lands first bumps, later S7 tasks in the same deploy do not bump again.
- packages/shared/src/constants.ts: remove ROLE_WORK_TIME_FACTOR, ROLE_STATIONS and DEADLINE_EXTENSION_MS. Add STATION_FAMILY (satisfies Record<StationKind, StationFamily>; the new-stations cluster must add geolocation:'image', metadata:'image', transcript:'documents', crossCheck:'sources'), type RolePerk, ROLE_PERKS (satisfies Record<Role, RolePerk>), ABILITY {expertise 60000; fieldCall 60000/callMs 6000; extendDeadline 60000/addMs 20000; secondChance 45000/rangeTiles 2.5; passFolder 30000/rangeTiles 6/flightMs 450}, RESCUE_ADD_MS = 20000 and ABILITY_FIRST_READY_MS = 0.
- packages/shared/src/domain.ts: roleSchema gains 'generalist' and 'rescuer' (in S7-B08). New abilitySchema ['expertise','fieldCall','extendDeadline','secondChance','passFolder'], stationFamilySchema ['image','documents','sources'], abilityStageSchema ['armed','disarmed','started','done','cancelled'] and stampSourceSchema ['minigame','expertise','fieldCall'], with ABILITIES and STATION_FAMILIES lists.
- packages/shared/src/entities.ts: new fieldCallSchema and abilityStateSchema {abilityReadyAtMs, abilityArmed, fieldCall|null, rescuesLeft}. folderSchema gains optional extendedMs (number >= 0).
- packages/shared/src/protocol.ts playerCommandSchema: remove {kind:'extendDeadline', folderId}; add {kind:'useAbility'} with no target.
- packages/shared/src/protocol.ts snapshotMessageSchema: remove deadlineExtensionUsed; add crew: z.array(crewSnapshotSchema = abilityStateSchema.extend({id})).max(MAX_PLAYERS). The versus/spectator clusters read it per team.
- packages/shared/src/protocol.ts gameEventSchema: remove 'deadlineExtended'. Add 'ability' {playerId, ability, stage, folderId?, stationId?, targetPlayerId?, addedMs?, reason?: 'dropped'|'gone'} and 'folderRescued' {playerId, folderId, addedMs, folderIds[1..8]}.
- packages/shared/src/protocol.ts: minigameFailed gains required lockoutMs (0 after Druga szansa; the difficulty cluster scales it). stampApplied gains required via: 'minigame'|'expertise'|'fieldCall'.
- packages/shared/src/sim/state.ts: GameState loses deadlineExtensionUsed. CrewMember becomes {role, workHeld, lastPingMs} & AbilityState, and addPlayer initialises the ability state.
- packages/shared/src/sim/frame.ts SimContext: new optional absent?: ReadonlySet<string> (disconnected players). It sits next to the difficulty cluster's optional tuning field.
- packages/shared/src/sim/step.ts: SUBSYSTEMS gains a new first subsystem, stepAbilities (before stepFolders).
- packages/shared/src/sim/desk.ts: canExtendDeadline and the extendDeadline handler are deleted. The speed bonus in evaluateVerdict uses deadlineMs - extendedMs. Cluster A rewrites the same function for multi-stamp verdicts, so the two edits must be merged.
- packages/shared/src/sim/stations.ts: workDurationMs uses roleWorkFactor and Math.round. New exported helpers drawMinigameSeed (shared with the sourceRegistry stable-seed cluster) and grantStamp. stepStations also returns crew.
- Client contracts: NavIntent gains 'ability' (ui-nav.ts; any exhaustive switch must handle it). createRuntime gains a third sendCommand parameter. cueForEvent gains a localPlayerId parameter and returns CueId|null. OverlayFrame gains a headerAction prop, also used by the station-help '?' button. FolderCard gains data-extended, data-rescue and data-ability-target, and must coexist with cluster A's 0/2 badge. TouchControls grid area 'ability'. AnimationTrigger gains 'abilityReady' and 'abilityDenied'. CueIds: the ability.* cues and role.rescue are added; folder.deadlineExtended is removed.
- Audio sprite: new ids abready, abpower and abthrow appended to SOUNDS in tools/audio/synth_placeholders.py.
- No DB, REST or content-schema changes.

## Cluster tasks (superseded by `tasks.md`)

- **S7-B01 — Ability contracts, crew state and role perk table** (L; depends on —). domain.ts: abilitySchema, stationFamilySchema, abilityStageSchema, stampSourceSchema. constants.ts: STATION_FAMILY (6 kinds), RolePerk, ROLE_PERKS for the 4 existing roles, ABILITY, RESCUE_ADD_MS, ABILITY_FIRST_READY_MS; delete ROLE_STATIONS and ROLE_WORK_TIME_FACTOR; PROTOCOL_VERSION 3. entities.ts: abilityStateSchema and folder.extendedMs. protocol.ts: useAbility command, snapshot.crew, 'ability' and 'folderRescued' events, minigameFailed.lockoutMs, stampApplied.via. The old extendDeadline command, snapshot flag and event stay until S7-B02. state.ts: CrewMember type and addPlayer. New sim/roles.ts (abilityOf, roleWorkFactor, expertiseCovers, familyStations). workDurationMs via roleWorkFactor; stations.ts emits lockoutMs and via:'minigame'. sim/abilities.ts: crewSnapshot only. Server snapshot crew. Client compile fixes: game-store crew; StationOverlay skipsQueue and RolePasses roleBonus from ROLE_PERKS; StationHost uses event.lockoutMs; event-cues, cues, captions and game-feel rows for the new events (existing sounds for now). cards.ts bonusLine from ROLE_PERKS. Fixtures in net.test, protocol.test, dev-fixture and fx.test. Glossary: families plus the ability and cooldown terms. Decision log rows 1, 2 and 7. *Done when:* bun run check is green. protocol.test parses useAbility, crew, ability, folderRescued, lockoutMs and via. roles.test literal factors pass (photoEditor imageSearch 2400, reporter sourceRegistry 2400, archivist dataLibrary 3000). The registry snapshot test sees a crew array. The sim ignores useAbility.
- **S7-B02 — stepAbilities: Przedłużenie, Koło ratunkowe, Telefon z terenu; remove the old extension** (L; depends on S7-B01). sim/abilities.ts: abilityPreview (rules for extendDeadline and fieldCall, plus the none/calling/armed/cooling checks), pickExtendTarget, extendFolders (raid waves), useAbility dispatch, progressFieldCalls, rescueCarriedFolders (keyed on rescuesLeft, so it is testable before the rescuer role exists), stepAbilities placed first in SUBSYSTEMS. desk.ts: delete canExtendDeadline and the extendDeadline handler; speed bonus on the base deadline. Delete GameState.deadlineExtensionUsed, the extendDeadline command, the snapshot flag and the deadlineExtended event. Client: delete stations/deadline-extension.ts and its test, the DeskOverlay EXTEND slot, button and hook, and the pl.desk.extend* strings; game-store drops deadlineExtensionUsed; the cue folder.deadlineExtended becomes ability.extendDeadline. Bot: maybeExtend becomes a useAbility press gated by the preview. Server test for useAbility. Decision log rows 3 and 6. *Done when:* abilities.test cases 1-6, 8, 11 and 12 pass with the literal values in the design. The registry test: f1 deadline 93000→113000 and crew readyAt = elapsed + 60000. No reference to extendDeadline or deadlineExtensionUsed is left (grep is clean). check is green.
- **S7-B03 — Sim: Ekspertyza, Druga szansa, Podaj teczkę** (M; depends on S7-B02). Finish abilityPreview with the expertise, secondChance and passFolder rules, pickPassTarget (nearest free teammate within 6 tiles, not operating, not in ctx.absent; tie goes to join order), and the APPLY handlers. stations.ts: export drawMinigameSeed and grantStamp; armed Ekspertyza is consumed at working→minigame; armed Druga szansa is consumed on failure (no lockout, the minigame reopens with the same operator). Immediate Ekspertyza in the minigame phase; immediate Druga szansa on a faced or nearby locked station. stepStations returns crew. Registry: ctx.absent. Decision log rows 4, 5 and 8. *Done when:* abilities.test cases 7, 9, 10 and 13 pass. The existing stations and sim determinism tests are still green. check is green.
- **S7-B04 — Input: R / RB / touch press, nav intent, runtime send, controls help** (M; depends on S7-B01). keyboard.ts: KEY_BINDINGS.ability ['KeyR']. gamepad.ts: PAD.rb = 5 and PadReading.ability. input-manager: latched.ability, the pad edge and touchInput.pressAbility. ui-nav: 'ability' intent (KeyR, RB); menu-nav passes it on. runtime.ts: third sendCommand parameter (wired in session.ts); press → getLocalAbilityPreview → send or the local 'ability.denied' cue. settings-model: 'ability' rows (R / RB / Zdolność) and pl.settings.actions.ability. SettingsTabs TouchPreview gets the 4th button. agents/platforms.md controls row. *Done when:* Unit tests: KeyR binding, button 5 reading, NAV_KEYS.KeyR === 'ability', settings rows. Pressing R in a dev room sends useAbility (checked through the server test hook). check is green.
- **S7-B05 — HUD ability chip, touch ability button, folder-card marks, design-rules amendment** (M; depends on S7-B03, S7-B04). apps/client/src/abilities/: ability-view.ts, use-ability.ts, ability-model.ts, ability-icons.ts, AbilityChip.tsx (+css; bottom-left, keyboard and gamepad only), AbilityButton.tsx (4th touch button in grid area 'ability', mirrored layout too). ui/ProgressRing.tsx extracted from WorkPrompt. New Icon paths retry, pass and lifebuoy; icon-coverage covers abilities. FolderCard data-extended / data-rescue / data-ability-target marks. The 'ability.ready' client cue on the cooling→ready transition and the abilityReady / abilityDenied HUD triggers. pl.hud.ability and pl.touch.ability strings. Amend agents/design-rules.md §1.3 and §5 in the same commit. *Done when:* ability-model.test (23 s, ring ≈ 0.617; calling 3 s, ring 0.5) and ability-view.test pass. Screenshots at 1366×768 and 640×360 (touch and mirrored) show the chip and button with no overlap. Reduced motion and no-flash are honoured. check is green.
- **S7-B06 — Overlays: Ekspertyza button, StationHost round nonce, Druga szansa hint, desk intent** (M; depends on S7-B03, S7-B05). OverlayFrame headerAction prop. StationOverlay Ekspertyza button plus 'ability' intent handling (settled=true, send, pending status), and skipsQueue from ROLE_PERKS. StationLayer StationHost: roundNonce on local minigameStarted, and no optimistic lockout. LockoutNote 'R/RB: Druga szansa' line (hidden under Ekspert). DeskOverlay 'ability' intent for the managing editor. Strings pl.station.expertise* and secondChance. *Done when:* Tests: StationHost reopens the overlay when the seed repeats (nonce). The LockoutNote hides at lockoutMs 0. Manual run: Ekspertyza from inside the overlay closes it and stamps; Druga szansa reopens the minigame. check is green.
- **S7-B07 — World feedback: markers, pass arc, ability clips, new sounds, final cue catalogue** (M; depends on S7-B03, S7-B05). abilities/AbilityMarkers.tsx (armed badge, call bubble with ring, pass-target ring for the local Ratownik). Folders.tsx pass arc (450 ms parabola; snaps under reduced motion). PlayerAvatar ability reactions. Controller stopUpper and the ABILITY_CLIPS abilityPower, abilityThrow and abilityCall. synth_placeholders.py: abready, abpower and abthrow appended; regenerate the sprite and run measure.py. Final cues.ts layers, captions.ts entries, cueForEvent(localPlayerId) returning null for remote arm/disarm, and the game-events contexts. agents/game-feel.md rows and docs/audio.md. *Done when:* fx.test covers every new event. captions compiles exhaustively. The animation-polish test (upper clips do not touch legs) passes with the new clips. perf:budget is green (sprite grows by about 15 KB). The draw-call count is unchanged in PerfOverlay.
- **S7-B08 — New roles Wszechstronny (generalist) and Ratownik (rescuer): ids, perks, art, strings** (L; depends on S7-B03). roleSchema + 'generalist' and 'rescuer'. ROLE_PERKS rows (otherWorkFactor 0.8 / secondChance; passFolder / rescuesPerLevel 1). vocab.roles, lobbyRoles.abilityWhat and the touch labels. RoleIcon paths (multi-tool, lifebuoy). rig.ts accessories (tool belt with pouches; lifebuoy with whistle) with unique vertex counts. Clips idleGeneral, idleRescuer, cheerGeneral and cheerRescuer, plus the controller switches. cards.ts ROLE_INFO rows. Balance ROLES_BY_CREW (generalist for 1 player). Glossary role rows. *Done when:* character.test sees 7 distinct vertex counts. animation-polish sees 6 unique fidgets and celebrations. icon-coverage passes. abilities.test runs the rescue, pass and second-chance cases through the real roles. check is green.
- **S7-B09 — Lobby role picker for 6 roles + Bez roli with detail panel** (M; depends on S7-B08). RolePasses: 7 native-radio cards (7 columns on desktop, 4 at 1000 px or narrower, 4 compact row cards at max-height 520 px landscape, 2 at 560 px or narrower). Detail panel (passive, active with device key, cooldown, family station chips filtered to the level). Teammate dots per card. Pure role-summary.ts with tests. Lobby passes levelStations; delete noEditor, showEditorNote and pl.lobbyRoles.noEditorNote; add the passiveNotHere / abilityNotHere notes. *Done when:* role-summary.test passes (reporter on l1: abilityUseful false; photoEditor on l4: both false). The e2e pickRole for 'Ratownik' and 'Wszechstronny' works. Screenshots at 640×360 and 1366×768 meet design-rules §10. check is green.
- **S7-B10 — Guidance hints and tutorial ability step** (M; depends on S7-B05, S7-B08). next-step.ts 'ability' kind (editor with a warned carried folder, reporter heading for the phone, generalist at a lockout) with device keys. use-guidance-driver passes the preview. tutorial.ts 'ability' step, the 'abilityUsed' signal and skipAbilityStep without a role. Tutorial card with RoleIcon. Strings pl.guidance.hint.ability* and tutorial.ability. Hand the pl.roles strings to the intro cluster for its roles slide. Ekspert gate: the difficulty cluster hides Guidance. *Done when:* next-step.test and tutorial.test pass with the literal texts ('R: +20 s dla teczki'). The tutorial completes for players with and without a role. check is green.
- **S7-B11 — Balance bots with abilities, tuning, contest role cards** (M; depends on S7-B03, S7-B08). bot.ts maybeUseAbility (extend, arm expertise and secondChance, fieldCall with a 'calling' phase; pass not used); phone queue from ROLE_PERKS. models.ts usesAbility. game.ts ROLES_BY_CREW plus the run.ts --roles presets (mixed, rescue, generalists); RunResult abilities and rescues. Run bun run balance and tune the ABILITY cooldowns in constants if the targets are exceeded. docs/balance.md update. cards.ts 6 cards on 2 A4 pages with a 'Zdolność' section; regenerate docs/contest/cards. *Done when:* The balance report runs for all 3 presets with no watchdog stalls. docs/balance.md records the results and any cooldown change. The cards render to 2 pages. check is green.
- **S7-B12 — Docs and e2e for roles and abilities** (S; depends on S7-B09, S7-B10, S7-B11). design-document.pl.md role table, controls line and removal of the 3-player rule. implementation-plan.md Stage 7 section S7-B list (mark S4-04 superseded) and the remaining Decision log rows. Glossary final pass (abilities table, Koło ratunkowe, uzbrojona, odnowienie; StationId→StationKind heading). New e2e/abilities.spec.ts (desktop editor R → cooling and data-extended; mobile Ratownik touch-ability 'Podaj'). multiplayer.spec role check. Regenerate the lobby and game contest screenshots. *Done when:* Both the desktop and mobile e2e projects pass. The docs match the code (glossary terms appear in pl.ts). check is green.

## Risks

- Balance: per-player cooldowns stack with non-exclusive roles. Four managing editors give 4 × 20 s every 60 s, which can make 3 stars trivial. S7-B11 measures this and may raise the extendDeadline cooldown (75–90 s) or switch to per-team cooldowns per ability.
- Role usefulness varies by level even with the families: Telefon z terenu does nothing on l0–l2 (no phone), the Fotoedytor's passive and Ekspertyza do nothing on l4, and the Archiwista's do nothing on l1. The lobby notes make this visible but do not fix it. The station bag (cluster A) and the new stations only partly even it out.
- Many shared files are touched by several clusters at once: protocol.ts, constants.ts, desk.ts evaluateVerdict, stations.ts, StationOverlay and StationLayer, Hud.tsx, TouchControls, FolderCard and pl.ts. Land S7-B01 early, keep diffs small and rebase often.
- Removing the deadlineExtended event, the extendDeadline command and the deadlineExtensionUsed field breaks cached clients. PROTOCOL_VERSION 3 plus the existing protocolMismatch handling covers it, but client and server must deploy together.
- Snapshot size grows by about 400 B per tick (crew × 4) at 20 Hz, about 8 KB/s per client. It can be trimmed later by sending crew only when it changes.
- Druga szansa keeps the operator while the minigame reopens. Without the StationHost round nonce the overlay would not reopen when the seed repeats (stable sourceRegistry seeds). The fix is client-side and needs a test.
- Podaj teczkę: the transfer is immediate and the flight is cosmetic. A thrown folder to a teammate whose connection just dropped is prevented by ctx.absent; without that field it would sit in a ghost's hands for up to RECONNECT_GRACE_MS. Leave and rejoin as a new id grants a fresh Ratownik rescue (minor exploit).
- Ekspertyza used from inside the overlay races the client-side 20 s timer. The overlay must set settled before sending, or a late minigameResult(false) could arrive; the server ignores it once the station is idle.
- Art cost: two accessories with unique vertex counts, 4 role clips, 3 ability clips, 3 icons, 3 synthesised sounds and the 2-page contest sheet layout. The uniqueness tests fail until all of it is done (S7-B08 is one larger commit).
- Bots cannot model Podaj teczkę, so balance numbers under-represent the Ratownik. Playtests must validate it.
- The 4th touch button adds one more target in the thumb cluster. It reuses the empty grid cell, so the footprint does not grow, but at touchScale 1.4 the cluster still covers bottom-right tables. The HUD-aware camera from the mobile cluster helps here.

## Open points (defaults chosen)

- Druga szansa: the default reopens the minigame at once, with no lockout and no re-hold, a slight extension of 'removes the lockout'. The alternative is idle-only, which is a one-line change in the APPLY handler and the failure hook.
- Cooldowns: the default is 60 s for Ekspertyza, Telefon z terenu and Przedłużenie, 45 s for Druga szansa and 30 s for Podaj teczkę, all in constants.ts. The alternative is a uniform 60 s. S7-B11 retunes them from bot data.
- Cooldown scope: the default is per player, even with duplicate roles. The alternative is a team-wide cooldown per ability.
- sourceRegistry family: the default puts it in the Reporter's 'Źródła' family so every level has a Reporter station. The alternative is the Archiwista's 'Dokumenty', which leaves the Reporter with no passive on l0–l2.
- Name of the managing editor's ability: the default is 'Przedłużenie' (touch label '+20 s'). The alternative is 'Więcej czasu', which is already the caption text.
- Koło ratunkowe trigger: the default fires at the deadline tick of a folder in the Ratownik's hands. The alternative fires at the 10 s warning.
- Telefon z terenu: the default requires a phone station on the map and ignores phone outages (it is the reporter's own phone). The call is cancelled when the folder leaves his hands, with no cooldown cost.
- Ekspertyza and Druga szansa can be pre-armed with R; a second press disarms. The cooldown starts only when the effect happens.
- Podaj teczkę: the default target is the nearest free teammate within 6 tiles, with no line-of-sight check and ties going to join order. Nothing happens and no cooldown is used when there is no target.
- Ekspert difficulty: the default keeps cooldowns unchanged and hides only the ability hints (next-step and LockoutNote). The chip stays visible.
- Abilities are ready at level start (ABILITY_FIRST_READY_MS = 0). A mid-game joiner gets a ready ability, and gets a rescue if he is a Ratownik.
- No desk '+20 s' button for touch editors inside the full-screen desk sheet, as the task requires. They use the thumb button before opening the sheet; keyboard and gamepad keep R/RB inside the sheet.
- A 'Role' tab in the encyclopedia or 'Jak grać' is left to the UI-expansion cluster; this cluster provides the pl.roles and role-summary data.
