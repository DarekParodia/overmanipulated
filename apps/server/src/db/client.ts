import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sql } from 'drizzle-orm';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema.ts';

export type Db = BunSQLiteDatabase<typeof schema> & { $client: Database };

export const MIGRATIONS_FOLDER = join(import.meta.dir, '..', '..', 'drizzle');

/**
 * Opens (or creates) the SQLite database and applies pending migrations.
 * Pass ':memory:' for tests.
 */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const client = new Database(path, { create: true, strict: true });
  client.run('PRAGMA journal_mode = WAL;');
  client.run('PRAGMA foreign_keys = ON;');
  const db = drizzle({ client, schema, casing: 'snake_case' });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

/** Cheap liveness check used by /health. */
export function isDatabaseHealthy(db: Db): boolean {
  try {
    db.get(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
