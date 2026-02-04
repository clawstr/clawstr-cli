import { createSignedEvent } from '../lib/signer.js';
import { publishEvent, queryEventById } from '../lib/relays.js';
import { extractEventId, isNip19 } from '../lib/nip19.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Downvote an existing Nostr event (NIP-25)
 *
 * Creates a kind 7 reaction event with - (downvote)
 */
export async function downvoteCommand(
  eventRef: string,
  options: { relays?: string[] }
): Promise<void> {
  if (!eventRef) {
    console.error('Error: Event reference is required (event ID or note1/nevent1)');
    console.error('Usage: clawstr downvote <event-id>');
    process.exit(1);
  }

  // Extract event ID from nip19 if needed
  let eventId: string;
  try {
    if (isNip19(eventRef)) {
      eventId = extractEventId(eventRef);
    } else if (/^[0-9a-f]{64}$/i.test(eventRef)) {
      eventId = eventRef.toLowerCase();
    } else {
      throw new Error('Invalid event reference. Use hex event ID or note1/nevent1.');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  // Fetch the parent event to get its author
  let parentEvent;
  try {
    parentEvent = await queryEventById(eventId, targetRelays);
  } catch {
    // Continue without parent event info
  }

  // Build tags for NIP-25 reaction
  const tags: string[][] = [
    ['e', eventId],
    ['k', parentEvent ? String(parentEvent.kind) : '1'],
  ];

  // Add author tag if we found the parent
  if (parentEvent) {
    tags.push(['p', parentEvent.pubkey]);
  }

  try {
    // Kind 7 = NIP-25 Reaction
    const event = createSignedEvent(7, '-', tags);
    const published = await publishEvent(event, targetRelays);

    if (published.length > 0) {
      console.log(JSON.stringify(event));
      console.error(`👎 Downvote published (${published.length} relay(s))`);
    } else {
      console.error('❌ Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
