// Round signs over the interactive fixtures (design-rules §7): every station, each conveyor run
// ("Wejście") and each editorial desk run ("Stół") gets a floating white badge with its icon
// and a one-word name. The badge doubles as the station dial: a chunky ring around it fills
// green while someone works, shows the operator's colour during a minigame or at a busy desk,
// and drains red under a cross during a lockout. The conveyor's ring fills blue towards the next
// scheduled folder ("za N s") and turns orange while the belt is full ("Pełna", S7-09). DOM in
// one layer over the canvas: no draw calls, crisp text.

import { useFrame } from '@react-three/fiber';
import type { Fixture, Station, TileMap } from '@redakcja/shared';
import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { GameView } from '../net/game-view.ts';
import { useGameView, viewRoster } from '../net/view-context.tsx';
import { useSettings } from '../store/settings.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import {
  conveyorIndicator,
  SIGN_ABOVE,
  type StationIndicator,
  stationIndicator,
  surfaceHeight,
} from './entities.ts';
import { screenTransform, useOverlay } from './overlay.ts';
import styles from './StationIndicators.module.css';

const FILL_RATE = 12;
/** Ring circumference in SVG units (r = 27). */
const RING_RADIUS = 27;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

type SignKind = keyof typeof pl.vocab.signs;

type Sign = {
  id: string;
  kind: SignKind;
  x: number;
  z: number;
  height: number;
  /** Station, or every desk tile of a desk run, whose state the ring shows; empty for the
   * conveyor. */
  fixtureIds: readonly string[];
};

type RoomPlayers = readonly { id: string; colorIndex: number }[] | undefined;

/** Groups touching fixtures of one kind into runs (conveyor belts, desk blocks). */
function runsOf(map: TileMap, kind: 'conveyor' | 'desk'): Fixture[][] {
  const left = map.fixtures.filter((f) => f.kind === kind);
  const runs: Fixture[][] = [];
  while (left.length > 0) {
    const run = left.splice(0, 1);
    for (let i = 0; i < run.length; i++) {
      const from = run[i];
      for (let j = left.length - 1; j >= 0; j--) {
        const other = left[j];
        if (
          from &&
          other &&
          Math.abs(other.col - from.col) + Math.abs(other.row - from.row) === 1
        ) {
          run.push(other);
          left.splice(j, 1);
        }
      }
    }
    runs.push(run);
  }
  return runs;
}

function collectSigns(map: TileMap): Sign[] {
  const signs: Sign[] = [];
  for (const fixture of map.fixtures) {
    if (fixture.kind === 'station' && fixture.station) {
      signs.push({
        id: fixture.id,
        kind: fixture.station,
        x: fixture.col + 0.5,
        z: fixture.row + 0.5,
        height: surfaceHeight(fixture) + SIGN_ABOVE,
        fixtureIds: [fixture.id],
      });
    }
  }
  for (const kind of ['conveyor', 'desk'] as const) {
    for (const run of runsOf(map, kind)) {
      const first = run[0];
      if (!first) {
        continue;
      }
      const mean = (pick: (f: Fixture) => number) =>
        run.reduce((sum, f) => sum + pick(f), 0) / run.length + 0.5;
      signs.push({
        id: first.id,
        kind,
        x: mean((f) => f.col),
        z: mean((f) => f.row),
        height: surfaceHeight(first) + SIGN_ABOVE,
        // A desk run (one table) shares one sign; it shows whichever desk tile is in use.
        fixtureIds: kind === 'desk' ? run.map((f) => f.id) : [],
      });
    }
  }
  return signs;
}

function indicatorFor(view: GameView, sign: Sign): StationIndicator {
  const state = view.store.getState();
  if (sign.kind === 'conveyor') {
    return conveyorIndicator(state.nextFolder, state.elapsedMs, state.conveyorFull);
  }
  if (sign.fixtureIds.length === 0) {
    return { kind: 'none' };
  }
  if (sign.kind === 'desk') {
    const desk = state.desks.find((d) => sign.fixtureIds.includes(d.id) && d.operatorId);
    return desk?.operatorId ? { kind: 'busy', operatorId: desk.operatorId } : { kind: 'none' };
  }
  const station: Station | undefined = state.stations.find((s) => s.id === sign.fixtureIds[0]);
  const events = view.events.getState();
  return stationIndicator(
    station,
    station ? events.outageTotals[station.id] : undefined,
    station ? events.lockoutTotals[station.id] : undefined,
  );
}

/** The operator's player colour (shown on the badge outline), or the plain outline. */
function operatorColor(indicator: StationIndicator, players: RoomPlayers): string {
  const operatorId =
    indicator.kind === 'working' || indicator.kind === 'busy' ? indicator.operatorId : null;
  const player = operatorId ? players?.find((p) => p.id === operatorId) : undefined;
  return player ? playerColorVar(player.colorIndex) : 'var(--outline)';
}

function ringColor(indicator: StationIndicator, players: RoomPlayers): string {
  if (indicator.kind === 'lockout') {
    return 'var(--red)';
  }
  if (indicator.kind === 'down' || indicator.kind === 'full') {
    return 'var(--orange)';
  }
  if (indicator.kind === 'incoming') {
    return 'var(--blue)';
  }
  if (indicator.kind === 'working') {
    return 'var(--green)';
  }
  if (indicator.kind === 'busy') {
    const player = players?.find((p) => p.id === indicator.operatorId);
    return player ? playerColorVar(player.colorIndex) : 'var(--text-faint)';
  }
  return 'transparent';
}

type SignHandle = {
  sign: Sign;
  anchor: HTMLDivElement | null;
  element: HTMLDivElement | null;
  ring: SVGCircleElement | null;
  /** Seconds left of an outage, written into the name pill while the station is down. */
  seconds: HTMLSpanElement | null;
  /** Conveyor only: "za N s" until the next scheduled folder, written into the name pill. */
  incoming: HTMLSpanElement | null;
  shown: {
    /** Outage seconds last written. */
    secondsLeft: number;
    /** Seconds to the next folder last written. */
    incomingSeconds: number;
    kind: StationIndicator['kind'];
    fraction: number;
    offset: string;
    color: string;
    operator: string;
  };
  /** Last transform written to the anchor. */
  at: string;
};

function SignBadge({ handle }: { handle: SignHandle }) {
  const { sign } = handle;
  return (
    <div
      ref={(anchor) => {
        // A fresh element starts unstyled: forget what was written to the previous one.
        handle.anchor = anchor;
        handle.at = '';
        // The old overlay root unmounts later than the new one mounts: only clear our own.
        return () => {
          if (handle.anchor === anchor) {
            handle.anchor = null;
          }
        };
      }}
      className={styles.anchor}
    >
      <div
        ref={(element) => {
          handle.element = element;
          handle.shown = { ...handle.shown, kind: 'none', offset: '', color: '', operator: '' };
          return () => {
            if (handle.element === element) {
              handle.element = null;
            }
          };
        }}
        className={styles.sign}
        data-testid="station-sign"
        data-kind={sign.kind}
        data-state="none"
      >
        <span className={styles.badge}>
          <svg className={styles.dial} viewBox="0 0 64 64" aria-hidden="true">
            <circle className={styles.track} cx="32" cy="32" r={RING_RADIUS} />
            <circle className={styles.slot} cx="32" cy="32" r={RING_RADIUS} />
            <circle
              ref={(ring) => {
                handle.ring = ring;
                handle.shown = { ...handle.shown, offset: '' };
                return () => {
                  if (handle.ring === ring) {
                    handle.ring = null;
                  }
                };
              }}
              className={styles.fill}
              cx="32"
              cy="32"
              r={RING_RADIUS}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={0}
            />
          </svg>
          <span className={styles.face}>
            <Icon name={sign.kind} size={28} />
            <span className={styles.cross}>
              <Icon name="cross" size={28} />
            </span>
            <span className={styles.bolt}>
              <Icon name="bolt" size={28} />
            </span>
          </span>
        </span>
        <span className={styles.name}>
          <span className={styles.nameUp}>{pl.vocab.signs[sign.kind]}</span>
          {sign.kind === 'conveyor' && (
            <>
              <span
                className={styles.nameIncoming}
                ref={(element) => {
                  handle.incoming = element;
                  handle.shown = { ...handle.shown, incomingSeconds: -1 };
                  return () => {
                    if (handle.incoming === element) {
                      handle.incoming = null;
                    }
                  };
                }}
              />
              <span className={styles.nameFull}>{pl.hud.next.signFull}</span>
            </>
          )}
          <span className={styles.nameDown}>
            {pl.events.badge.down}{' '}
            <span
              ref={(element) => {
                handle.seconds = element;
                handle.shown = { ...handle.shown, secondsLeft: -1 };
                return () => {
                  if (handle.seconds === element) {
                    handle.seconds = null;
                  }
                };
              }}
            />
          </span>
        </span>
      </div>
    </div>
  );
}

/** Updates one sign's ring from the game state; DOM writes only when something changed. */
function updateSign(view: GameView, handle: SignHandle, delta: number, players: RoomPlayers): void {
  const { element, ring } = handle;
  if (!element || !ring) {
    return;
  }
  const indicator = indicatorFor(view, handle.sign);
  const current = handle.shown;
  const target = 'fraction' in indicator ? indicator.fraction : 1;
  if (indicator.kind === 'down' && handle.seconds && current.secondsLeft !== indicator.seconds) {
    current.secondsLeft = indicator.seconds;
    handle.seconds.textContent = String(indicator.seconds);
  }
  if (
    indicator.kind === 'incoming' &&
    handle.incoming &&
    current.incomingSeconds !== indicator.seconds
  ) {
    current.incomingSeconds = indicator.seconds;
    handle.incoming.textContent = pl.hud.next.sign(indicator.seconds);
  }
  if (indicator.kind !== current.kind) {
    current.kind = indicator.kind;
    current.fraction = target;
    element.dataset.state = indicator.kind;
  }
  const reducedMotion = useSettings.getState().reducedMotion;
  const k = reducedMotion ? 1 : 1 - Math.exp(-FILL_RATE * delta);
  current.fraction += (target - current.fraction) * k;
  const offset = (RING_LENGTH * (1 - current.fraction)).toFixed(1);
  if (offset !== current.offset) {
    current.offset = offset;
    ring.style.strokeDashoffset = offset;
  }
  const color = ringColor(indicator, players);
  if (color !== current.color) {
    current.color = color;
    element.style.setProperty('--ring', color);
  }
  const operator = operatorColor(indicator, players);
  if (operator !== current.operator) {
    current.operator = operator;
    element.style.setProperty('--operator', operator);
  }
}

/**
 * All signs live in one DOM layer over the canvas (see overlay.ts); each frame the anchors move
 * to the projected sign positions.
 */
export function StationIndicators() {
  const view = useGameView();
  const handles = useMemo(
    () =>
      collectSigns(view.runtime.map).map(
        (sign): SignHandle => ({
          sign,
          anchor: null,
          element: null,
          ring: null,
          seconds: null,
          incoming: null,
          shown: {
            secondsLeft: -1,
            incomingSeconds: -1,
            kind: 'none',
            fraction: 1,
            offset: '',
            color: '',
            operator: '',
          },
          at: '',
        }),
      ),
    [view],
  );
  const projected = useMemo(() => new Vector3(), []);

  const badges = useMemo(
    () => handles.map((handle) => <SignBadge key={handle.sign.id} handle={handle} />),
    [handles],
  );
  useOverlay(styles.layer ?? '', badges);

  useFrame(({ camera, size }, delta) => {
    const players = viewRoster(view);
    for (const handle of handles) {
      const anchor = handle.anchor;
      if (!anchor) {
        continue;
      }
      projected.set(handle.sign.x, handle.sign.height, handle.sign.z);
      const at = screenTransform(projected, camera, size) ?? 'scale(0)';
      if (at !== handle.at) {
        handle.at = at;
        anchor.style.transform = at;
      }
      updateSign(view, handle, delta, players);
    }
  });

  return null;
}
