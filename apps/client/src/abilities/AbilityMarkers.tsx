// Role ability markers in the world (S7-42), all DOM via drei Html like the ping bubbles (no draw
// calls, at most MAX_ABILITY_MARKERS nodes):
// - an armed ability: a blue ring with the ability icon beside the player;
// - Telefon z terenu: a phone in an orange ring that drains while the call runs (both beside
//   the body at hip height, clear of the name tag);
// - Podaj teczkę: a dashed blue ring on the floor under the teammate the local Ratownik's press
//   would reach now.
// Anchors follow the rendered player positions every frame. The floor ring's slow pulse is off
// under reduced motion and no-flash.
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { abilityOf, type Role } from '@redakcja/shared';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { useLevelClock } from '../hud/use-level-clock.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { CHARACTER_HEIGHT } from '../scene/character/rig.ts';
import { renderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { ProgressRing } from '../ui/ProgressRing.tsx';
import styles from './AbilityMarkers.module.css';
import { ABILITY_ICON } from './ability-icons.ts';
import { type AbilityMarker, abilityMarkers } from './ability-markers.ts';
import { useLocalAbility } from './use-ability.ts';

/**
 * Height of the player marker's anchor: at the hips, beside the body (offset sideways in CSS),
 * so the ring stays clear of the name tag over the head even with a long nickname.
 */
const BODY_MARKER_HEIGHT = CHARACTER_HEIGHT * 0.35;
/** The floor ring sits just above the floor so it never fights with it. */
const FLOOR_RING_HEIGHT = 0.02;

export function AbilityMarkers() {
  const crew = useGame((s) => s.crew);
  const players = useApp((s) => s.room?.players);
  const { elapsedMs } = useLevelClock();
  const local = useLocalAbility(runtime);
  const roles = useMemo(
    () => new Map<string, Role | null>((players ?? []).map((p) => [p.id, p.role])),
    [players],
  );
  const markers = abilityMarkers({
    crew,
    abilityOf: (id) => abilityOf(roles.get(id) ?? null),
    elapsedMs,
    local,
  });
  return (
    <>
      {markers.map((marker) => {
        const nickname = players?.find((p) => p.id === marker.playerId)?.nickname ?? '';
        return (
          <MarkerAnchor
            key={`${marker.kind}:${marker.playerId}`}
            marker={marker}
            nickname={nickname}
          />
        );
      })}
    </>
  );
}

function MarkerAnchor({ marker, nickname }: { marker: AbilityMarker; nickname: string }) {
  const anchor = useRef<Group>(null);
  const start = renderState.players.get(marker.playerId);

  useFrame(() => {
    const player = renderState.players.get(marker.playerId);
    const group = anchor.current;
    if (group && player) {
      group.position.set(player.x, 0, player.y);
    }
  });

  const floor = marker.kind === 'passTarget';
  return (
    <group
      ref={anchor}
      name={`ability-marker:${marker.kind}:${marker.playerId}`}
      position={[start?.x ?? 0, 0, start?.y ?? 0]}
    >
      <Html
        position={[0, floor ? FLOOR_RING_HEIGHT : BODY_MARKER_HEIGHT, 0]}
        center
        zIndexRange={[10, 1]}
        className={styles.wrap}
      >
        <MarkerBody marker={marker} nickname={nickname} />
      </Html>
    </group>
  );
}

function MarkerBody({ marker, nickname }: { marker: AbilityMarker; nickname: string }) {
  const names = pl.hud.ability.marker;
  const common = {
    'data-testid': 'ability-marker',
    'data-kind': marker.kind,
    'data-player-id': marker.playerId,
  } as const;
  switch (marker.kind) {
    case 'armed':
      return (
        <span
          {...common}
          role="img"
          className={styles.head}
          aria-label={names.armed(nickname, pl.vocab.abilities[marker.ability])}
        >
          <ProgressRing progress={1} tone="armed" className={styles.ring}>
            <Icon name={ABILITY_ICON[marker.ability]} size={18} />
          </ProgressRing>
        </span>
      );
    case 'call':
      return (
        <span {...common} role="img" className={styles.head} aria-label={names.calling(nickname)}>
          <ProgressRing progress={marker.ring} tone="call" className={styles.ring}>
            <Icon name={ABILITY_ICON.fieldCall} size={18} />
          </ProgressRing>
        </span>
      );
    case 'passTarget':
      return (
        <span
          {...common}
          role="img"
          className={styles.floor}
          aria-label={names.passTarget(nickname)}
        />
      );
  }
}
