import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VerifiedEvent } from 'nostr-tools';
import { encodeNote } from '../../src/lib/nip19.js';

const TEST_EVENT_ID = '1'.repeat(64);
const TEST_EVENT_ID_2 = '2'.repeat(64);

const mockKeyPair = {
  secretKey: new Uint8Array(32),
  publicKey: 'a'.repeat(64),
  nsec: 'nsec1mock',
  npub: 'npub1mock',
};

const createMockEvent = (id: string, pubkey: string, kind: number): VerifiedEvent =>
  ({
    id,
    pubkey,
    kind,
    sig: 'b'.repeat(128),
    created_at: Math.floor(Date.now() / 1000),
    content: '',
    tags: [],
  }) as VerifiedEvent;

vi.mock('../../src/lib/signer.js', () => ({
  createSignedEvent: vi.fn((kind: number, _content: string, _tags: string[][]) =>
    createMockEvent('deletion-' + kind, mockKeyPair.publicKey, kind)
  ),
}));

vi.mock('../../src/lib/relays.js', () => ({
  queryEventById: vi.fn(),
  publishEvent: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  DEFAULT_RELAYS: ['wss://relay.test'],
}));

import { deleteCommand } from '../../src/commands/delete.js';
import { queryEventById, publishEvent } from '../../src/lib/relays.js';
import { createSignedEvent } from '../../src/lib/signer.js';
import { loadKeyPair } from '../../src/lib/keys.js';

// Use actual keys module but with our test dir
vi.mock('../../src/lib/keys.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/keys.js')>();
  return {
    ...actual,
    loadKeyPair: vi.fn(),
  };
});

describe('deleteCommand', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT:${code}`);
    }) as () => never);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(loadKeyPair).mockReturnValue(mockKeyPair as ReturnType<typeof loadKeyPair>);
    vi.mocked(queryEventById).mockResolvedValue(
      createMockEvent(TEST_EVENT_ID, mockKeyPair.publicKey, 1111)
    );
    vi.mocked(publishEvent).mockResolvedValue(['wss://relay.test']);
  });

  afterEach(() => {
    exitSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  const expectExit = async (fn: () => Promise<void>) => {
    await expect(fn()).rejects.toThrow(/^EXIT:1$/);
  };

  describe('input validation', () => {
    it('should exit with error when eventRefs is empty', async () => {
      await expectExit(() => deleteCommand([], {}));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: At least one event reference is required'
      );
    });

    it('should exit with error when eventRefs is undefined', async () => {
      await expectExit(() =>
        deleteCommand(undefined as unknown as string[], {})
      );
    });

    it('should exit with error when all refs are whitespace', async () => {
      await expectExit(() => deleteCommand(['  ', '\t', ''], {}));
    });

    it('should exit with error when no secret key', async () => {
      vi.mocked(loadKeyPair).mockReturnValue(null);

      await expectExit(() => deleteCommand([TEST_EVENT_ID], {}));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error: No secret key found. Run `clawstr init` first.'
      );
    });

    it('should exit with error for invalid event reference', async () => {
      await expectExit(() => deleteCommand(['not-valid-id'], {}));
      expect(queryEventById).not.toHaveBeenCalled();
    });
  });

  describe('ownership and relay validation', () => {
    it('should exit when event not found on any relay', async () => {
      vi.mocked(queryEventById).mockResolvedValue(null);

      await expectExit(() => deleteCommand([TEST_EVENT_ID], {}));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('not found on any relay')
      );
    });

    it('should exit when event was not authored by user', async () => {
      vi.mocked(queryEventById).mockResolvedValue(
        createMockEvent(TEST_EVENT_ID, 'other'.repeat(16), 1111)
      );

      await expectExit(() => deleteCommand([TEST_EVENT_ID], {}));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('was not authored by you')
      );
    });
  });

  describe('successful deletion', () => {
    it('should create kind 5 event with correct e and k tags', async () => {
      await deleteCommand([TEST_EVENT_ID], {});

      expect(createSignedEvent).toHaveBeenCalledWith(
        5,
        '',
        expect.arrayContaining([
          ['e', TEST_EVENT_ID],
          ['k', '1111'],
        ])
      );
    });

    it('should pass reason to content', async () => {
      await deleteCommand([TEST_EVENT_ID], {
        reason: 'posted by accident',
      });

      expect(createSignedEvent).toHaveBeenCalledWith(
        5,
        'posted by accident',
        expect.any(Array)
      );
    });

    it('should trim reason content', async () => {
      await deleteCommand([TEST_EVENT_ID], {
        reason: '  reason with spaces  ',
      });

      expect(createSignedEvent).toHaveBeenCalledWith(
        5,
        'reason with spaces',
        expect.any(Array)
      );
    });

    it('should handle hex event ID', async () => {
      await deleteCommand([TEST_EVENT_ID], {});

      expect(queryEventById).toHaveBeenCalledWith(
        TEST_EVENT_ID.toLowerCase(),
        ['wss://relay.test']
      );
    });

    it('should handle NIP-19 note1 event reference', async () => {
      const note = encodeNote(TEST_EVENT_ID);

      await deleteCommand([note], {});

      expect(queryEventById).toHaveBeenCalledWith(TEST_EVENT_ID, [
        'wss://relay.test',
      ]);
    });

    it('should use custom relays when provided', async () => {
      const customRelays = ['wss://custom.relay', 'wss://other.relay'];

      await deleteCommand([TEST_EVENT_ID], { relays: customRelays });

      expect(queryEventById).toHaveBeenCalledWith(
        expect.any(String),
        customRelays
      );
      expect(publishEvent).toHaveBeenCalledWith(
        expect.any(Object),
        customRelays
      );
    });

    it('should handle multiple events', async () => {
      vi.mocked(queryEventById)
        .mockResolvedValueOnce(
          createMockEvent(TEST_EVENT_ID, mockKeyPair.publicKey, 1111)
        )
        .mockResolvedValueOnce(
          createMockEvent(TEST_EVENT_ID_2, mockKeyPair.publicKey, 1111)
        );

      await deleteCommand([TEST_EVENT_ID, TEST_EVENT_ID_2], {});

      expect(createSignedEvent).toHaveBeenCalledWith(
        5,
        '',
        expect.arrayContaining([
          ['e', TEST_EVENT_ID],
          ['k', '1111'],
          ['e', TEST_EVENT_ID_2],
          ['k', '1111'],
        ])
      );
    });

    it('should deduplicate same event ID when passed multiple times', async () => {
      vi.mocked(queryEventById).mockResolvedValue(
        createMockEvent(TEST_EVENT_ID, mockKeyPair.publicKey, 1111)
      );

      await deleteCommand([TEST_EVENT_ID, TEST_EVENT_ID], {});

      const tags = vi.mocked(createSignedEvent).mock.calls[0][2];
      const eTags = tags.filter((t) => t[0] === 'e');
      expect(eTags).toHaveLength(1);
      expect(eTags[0][1]).toBe(TEST_EVENT_ID);
    });

    it('should log success message', async () => {
      await deleteCommand([TEST_EVENT_ID], {});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Deletion request published/)
      );
    });
  });

  describe('publish failure', () => {
    it('should exit when publishEvent returns empty array', async () => {
      vi.mocked(publishEvent).mockResolvedValue([]);

      await expectExit(() => deleteCommand([TEST_EVENT_ID], {}));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to publish')
      );
    });
  });
});
