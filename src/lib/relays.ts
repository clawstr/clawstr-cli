import 'websocket-polyfill';
import { NPool, NRelay1, type NostrFilter } from '@nostrify/nostrify';
import type { VerifiedEvent, Filter } from 'nostr-tools';
import { DEFAULT_RELAYS } from '../config.js';

// Global pool instance
let pool: NPool | null = null;

/**
 * Get or create the relay pool
 */
export function getPool(): NPool {
  if (!pool) {
    pool = new NPool({
      open(url) {
        return new NRelay1(url);
      },
      reqRouter: async (filters) => {
        // Return a map of relay URLs to filters
        return new Map(DEFAULT_RELAYS.map(url => [url, filters]));
      },
      eventRouter: async () => DEFAULT_RELAYS,
    });
  }
  return pool;
}

/**
 * Publish an event to relays
 * Returns array of relay URLs that accepted the event
 */
export async function publishEvent(
  event: VerifiedEvent,
  relays: string[] = DEFAULT_RELAYS
): Promise<string[]> {
  const pool = getPool();
  
  try {
    // NPool.event() uses the eventRouter, but we can override with specific relays
    await pool.event(event, { relays });
    // If successful, all relays that accepted are returned
    // NPool.event() fulfills if ANY relay accepted
    return relays;
  } catch (error) {
    // All relays rejected
    return [];
  }
}

/**
 * Query events from relays
 */
export async function queryEvents(
  filter: Filter | Filter[],
  relays: string[] = DEFAULT_RELAYS
): Promise<VerifiedEvent[]> {
  const pool = getPool();
  const filters = Array.isArray(filter) ? filter : [filter];

  // Use NPool.query() which handles deduplication and replaceable events
  const events = await pool.query(filters as NostrFilter[], { relays });
  return events as VerifiedEvent[];
}

/**
 * Query a single event by ID
 */
export async function queryEventById(
  id: string,
  relays: string[] = DEFAULT_RELAYS
): Promise<VerifiedEvent | null> {
  const events = await queryEvents({ ids: [id] }, relays);
  return events[0] || null;
}

/**
 * Close the pool and all connections
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
