import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Redirect store DB to a temp path so we never touch user data
vi.mock('../../src/config.js', () => {
  const testDir = join(tmpdir(), 'clawstr-timestamp-test-' + process.pid + '-' + Date.now());
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
import { resolveTimestampParam, trackLatestTimestamp } from '../../src/lib/timestamp.js';
import {
  closeStore,
  setLatestTimestamp,
  getLatestTimestamp,
  getLastSeenTimestamp,
  setLastSeenTimestamp,
} from '../../src/lib/store.js';
import { PATHS } from '../../src/config.js';

describe('timestamp lib', () => {
  beforeEach(() => {
    closeStore();
  });

  afterEach(() => {
    closeStore();
    if (existsSync(PATHS.configDir)) {
      rmSync(PATHS.configDir, { recursive: true });
    }
  });

  describe('resolveTimestampParam', () => {
    it('should return undefined when value is undefined', () => {
      expect(resolveTimestampParam(undefined)).toBeUndefined();
    });

    it('should parse a numeric string into a number', () => {
      expect(resolveTimestampParam('1700000000')).toBe(1700000000);
    });

    it('should parse zero', () => {
      expect(resolveTimestampParam('0')).toBe(0);
    });

    it('should resolve "latest" to the stored latest_timestamp', () => {
      setLatestTimestamp(1700000000);
      expect(resolveTimestampParam('latest')).toBe(1700000000);
    });

    it('should exit with error when "latest" has no stored value', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => resolveTimestampParam('latest')).toThrow('process.exit');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No "latest" timestamp stored'));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should exit with error for a non-numeric non-latest string', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => resolveTimestampParam('not-a-number')).toThrow('process.exit');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid timestamp value'));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('trackLatestTimestamp', () => {
    it('should do nothing when events array is empty', () => {
      trackLatestTimestamp([]);
      expect(getLastSeenTimestamp()).toBeUndefined();
    });

    it('should set last_seen_timestamp to max created_at + 1 for a single event', () => {
      trackLatestTimestamp([{ created_at: 1700000000 } as any]);
      expect(getLastSeenTimestamp()).toBe(1700000001);
    });

    it('should pick the maximum created_at + 1 across multiple events', () => {
      trackLatestTimestamp([
        { created_at: 1700000005 } as any,
        { created_at: 1700000001 } as any,
        { created_at: 1700000009 } as any,
        { created_at: 1700000003 } as any,
      ]);
      expect(getLastSeenTimestamp()).toBe(1700000010);
    });

    it('should NOT update last_seen_timestamp when the new batch is older', () => {
      // Previous batch had newer events — last_seen should not go backwards
      trackLatestTimestamp([{ created_at: 1700000020 } as any]);
      expect(getLastSeenTimestamp()).toBe(1700000021);

      trackLatestTimestamp([{ created_at: 1700000005 } as any]);
      // Older batch: last_seen stays at the higher value
      expect(getLastSeenTimestamp()).toBe(1700000021);
    });

    it('should advance last_seen_timestamp when the new batch is newer', () => {
      trackLatestTimestamp([{ created_at: 1700000000 } as any]);
      expect(getLastSeenTimestamp()).toBe(1700000001);

      trackLatestTimestamp([{ created_at: 1700000010 } as any]);
      expect(getLastSeenTimestamp()).toBe(1700000011);
    });

    it('should not affect latest_timestamp', () => {
      setLatestTimestamp(9999999999);
      trackLatestTimestamp([{ created_at: 1700000000 } as any]);
      // latest is untouched — trackLatestTimestamp only updates last_seen_timestamp
      expect(getLatestTimestamp()).toBe(9999999999);
    });
  });
});
