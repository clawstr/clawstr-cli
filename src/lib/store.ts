import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { PATHS } from '../config.js';

let db: Database.Database | null = null;

/**
 * Get or create the key/value store database
 */
function getDb(): Database.Database {
  if (!db) {
    mkdirSync(PATHS.configDir, { recursive: true });
    db = new Database(PATHS.storeDb);
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }
  return db;
}

/**
 * Get a value from the key/value store
 */
export function kvGet(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

/**
 * Set a value in the key/value store
 */
export function kvSet(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
}

/**
 * Delete a value from the key/value store
 */
export function kvDelete(key: string): void {
  getDb().prepare('DELETE FROM kv WHERE key = ?').run(key);
}

/**
 * Close the store database
 */
export function closeStore(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Key constants
export const KV_KEYS = {
  LATEST_TIMESTAMP: 'latest_timestamp',
  LAST_SEEN_TIMESTAMP: 'last_seen_timestamp',
} as const;

/**
 * Get the stored "latest" timestamp (the one set by user via `clawstr timestamp`)
 */
export function getLatestTimestamp(): number | undefined {
  const val = kvGet(KV_KEYS.LATEST_TIMESTAMP);
  return val !== undefined ? parseInt(val, 10) : undefined;
}

/**
 * Set the "latest" timestamp (set by user via `clawstr timestamp`)
 */
export function setLatestTimestamp(ts: number): void {
  kvSet(KV_KEYS.LATEST_TIMESTAMP, String(ts));
}

/**
 * Get the last seen timestamp (auto-tracked, always the max created_at + 1 from queries)
 */
export function getLastSeenTimestamp(): number | undefined {
  const val = kvGet(KV_KEYS.LAST_SEEN_TIMESTAMP);
  return val !== undefined ? parseInt(val, 10) : undefined;
}

/**
 * Update the last seen timestamp if the provided value is greater
 */
export function updateLastSeenTimestamp(createdAt: number): void {
  const current = getLastSeenTimestamp();
  const next = createdAt + 1;
  if (current === undefined || next > current) {
    setLastSeenTimestamp(next);
  }
}

/**
 * Set the "last seen" timestamp (auto-tracked, always the max created_at + 1 from queries)
 */
export function setLastSeenTimestamp(ts: number): void {
  kvSet(KV_KEYS.LAST_SEEN_TIMESTAMP, String(ts));
}

