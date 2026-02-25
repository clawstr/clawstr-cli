import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Unique temp dir per test run - factory must not reference outer variables
vi.mock('../../src/config.js', () => {
  const testDir = join(tmpdir(), 'clawstr-store-test-' + process.pid + '-' + Date.now());
  return {
    PATHS: {
      configDir: testDir,
      secretKey: join(testDir, 'secret.key'),
      config: join(testDir, 'config.json'),
      mnemonic: join(testDir, 'mnemonic'),
      walletDir: join(testDir, 'wallet'),
      walletDb: join(testDir, 'wallet', 'coco.db'),
      storeDb: join(testDir, 'store.db'),
    },
    DEFAULT_RELAYS: ['wss://relay.test'],
    DEFAULT_MINT: 'https://mint.test',
  };
});

// Import after mocking
import {
  kvGet,
  kvSet,
  kvDelete,
  closeStore,
  KV_KEYS,
  getLatestTimestamp,
  setLatestTimestamp,
  getLastSeenTimestamp,
  setLastSeenTimestamp,
  updateLastSeenTimestamp,
} from '../../src/lib/store.js';
import { PATHS } from '../../src/config.js';

describe('store module', () => {
  beforeEach(() => {
    // Reset the singleton so each test gets a fresh in-memory DB at the test path
    closeStore();
  });

  afterEach(() => {
    closeStore();
    // Clean up test DB file
    if (existsSync(PATHS.configDir)) {
      rmSync(PATHS.configDir, { recursive: true });
    }
  });

  describe('kvGet / kvSet', () => {
    it('should return undefined for a key that does not exist', () => {
      expect(kvGet('nonexistent')).toBeUndefined();
    });

    it('should store and retrieve a value', () => {
      kvSet('foo', 'bar');
      expect(kvGet('foo')).toBe('bar');
    });

    it('should overwrite an existing value', () => {
      kvSet('foo', 'bar');
      kvSet('foo', 'baz');
      expect(kvGet('foo')).toBe('baz');
    });

    it('should store multiple independent keys', () => {
      kvSet('a', '1');
      kvSet('b', '2');
      expect(kvGet('a')).toBe('1');
      expect(kvGet('b')).toBe('2');
    });
  });

  describe('kvDelete', () => {
    it('should delete an existing key', () => {
      kvSet('foo', 'bar');
      kvDelete('foo');
      expect(kvGet('foo')).toBeUndefined();
    });

    it('should not throw when deleting a non-existent key', () => {
      expect(() => kvDelete('nonexistent')).not.toThrow();
    });
  });

  describe('latest timestamp', () => {
    it('should return undefined when not set', () => {
      expect(getLatestTimestamp()).toBeUndefined();
    });

    it('should store and retrieve the latest timestamp', () => {
      setLatestTimestamp(1700000000);
      expect(getLatestTimestamp()).toBe(1700000000);
    });

    it('should overwrite the latest timestamp', () => {
      setLatestTimestamp(1700000000);
      setLatestTimestamp(1710000000);
      expect(getLatestTimestamp()).toBe(1710000000);
    });
  });

  describe('last seen timestamp', () => {
    it('should return undefined when not set', () => {
      expect(getLastSeenTimestamp()).toBeUndefined();
    });

    it('should store and retrieve the last seen timestamp', () => {
      setLastSeenTimestamp(1700000001);
      expect(getLastSeenTimestamp()).toBe(1700000001);
    });
  });

  describe('updateLastSeenTimestamp', () => {
    it('should set last seen when none stored yet', () => {
      updateLastSeenTimestamp(1700000000);
      // stored value is createdAt + 1
      expect(getLastSeenTimestamp()).toBe(1700000001);
    });

    it('should update if new value is greater', () => {
      updateLastSeenTimestamp(1700000000); // stores 1700000001
      updateLastSeenTimestamp(1700000005); // stores 1700000006
      expect(getLastSeenTimestamp()).toBe(1700000006);
    });

    it('should not update if new value is not greater', () => {
      updateLastSeenTimestamp(1700000005); // stores 1700000006
      updateLastSeenTimestamp(1700000000); // would store 1700000001 — less, skip
      expect(getLastSeenTimestamp()).toBe(1700000006);
    });

    it('should not update if new value is equal', () => {
      updateLastSeenTimestamp(1700000005); // stores 1700000006
      updateLastSeenTimestamp(1700000005); // would store 1700000006 — not greater, skip
      expect(getLastSeenTimestamp()).toBe(1700000006);
    });
  });

  describe('closeStore / persistence', () => {
    it('should persist data across close and reopen', () => {
      setLatestTimestamp(1700000000);
      closeStore(); // closes DB connection, resets singleton

      // Re-opening should read same file and find the value
      expect(getLatestTimestamp()).toBe(1700000000);
    });
  });
});
