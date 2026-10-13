// Server-side views of config.json: the room settings the registry reads at every room creation.
// The public subset served to clients (S7-69) is derived here too, never as a pick of the
// server config.
import type { Difficulty, FeatureFlags } from '@redakcja/shared';
import type { ServerConfig } from './config.ts';

/** What the room registry reads from config.json; hot, so a reload applies to the next room. */
export type RoomSettings = {
  maxRooms: number;
  features: FeatureFlags;
  defaultDifficulty: Difficulty;
};

export function roomSettings(config: ServerConfig): RoomSettings {
  return {
    maxRooms: config.rooms.maxRooms,
    features: config.features,
    defaultDifficulty: config.rooms.defaultDifficulty,
  };
}
