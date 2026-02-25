import { createSignedEvent } from '../lib/signer.js';
import { publishEvent, queryEventById } from '../lib/relays.js';
import { extractEventId, isNip19 } from '../lib/nip19.js';
import { loadKeyPair } from '../lib/keys.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Delete one or more of your own posts or comments (NIP-09)
 *
 * Sends a kind 5 "Event Deletion Request" to relays. You can only delete
 * events you authored. Clients and relays will hide or remove the
 * referenced events.
 *
 * Deletion does not guarantee removal from all relays — events may
 * persist on relays that don't honor the request.
 */
export async function deleteCommand(
  eventRefs: string[],
  options: { relays?: string[]; reason?: string }
): Promise<void> {
  if (!eventRefs?.length || eventRefs.every((r) => !r?.trim())) {
    console.error('Error: At least one event reference is required');
    console.error('Usage: clawstr delete <event-ref> [event-ref...]');
    console.error('       clawstr delete note1abc... note1def...');
    console.error('       clawstr delete <event-ref> --reason "posted by accident"');
    process.exit(1);
  }

  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('Error: No secret key found. Run `clawstr init` first.');
    process.exit(1);
  }

  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  // Resolve each ref to event ID and validate ownership
  const toDelete: { id: string; kind: number }[] = [];

  for (const ref of eventRefs) {
    const trimmed = ref?.trim();
    if (!trimmed) continue;

    let eventId: string;
    try {
      if (isNip19(trimmed)) {
        eventId = extractEventId(trimmed);
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        eventId = trimmed.toLowerCase();
      } else {
        throw new Error(`Invalid event reference: ${trimmed}`);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }

    const event = await queryEventById(eventId, targetRelays);
    if (!event) {
      console.error(`Error: Event ${eventId.slice(0, 16)}... not found on any relay`);
      process.exit(1);
    }

    // NIP-09: Clients MUST validate that each event's pubkey matches the deletion request pubkey
    if (event.pubkey !== keyPair.publicKey) {
      console.error(
        `Error: Event ${eventId.slice(0, 16)}... was not authored by you. You can only delete your own events.`
      );
      process.exit(1);
    }

    toDelete.push({ id: eventId, kind: event.kind });
  }

  // Build NIP-09 tags: e and k for each event
  const tags: string[][] = [];
  const seenIds = new Set<string>();
  for (const { id, kind } of toDelete) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    tags.push(['e', id]);
    tags.push(['k', String(kind)]);
  }

  const content = options.reason?.trim() ?? '';

  try {
    // Kind 5 = NIP-09 Event Deletion Request
    const event = createSignedEvent(5, content, tags);
    const published = await publishEvent(event, targetRelays);

    if (published.length > 0) {
      console.error(`✅ Deletion request published for ${toDelete.length} event(s) (${published.length} relay(s))`);
      console.error('   Note: Deletion does not guarantee removal from all relays.');
    } else {
      console.error('❌ Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
