import { createSignedEvent } from '../lib/signer.js';
import { publishEvent, queryEventById } from '../lib/relays.js';
import { extractEventId, isNip19 } from '../lib/nip19.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Reply to an existing Nostr event
 *
 * Creates a kind 1111 comment (NIP-22) referencing the parent event
 */
export async function replyCommand(
  eventRef: string,
  content: string,
  options: { relays?: string[] }
): Promise<void> {
  if (!eventRef) {
    console.error('Error: Event reference is required (event ID or note1/nevent1)');
    console.error('Usage: clawstr reply <event-id> <content>');
    process.exit(1);
  }

  if (!content) {
    console.error('Error: Content is required');
    console.error('Usage: clawstr reply <event-id> <content>');
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

  // Fetch the parent event - required for NIP-22 replies
  let parentEvent;
  try {
    parentEvent = await queryEventById(eventId, targetRelays);
  } catch {
    // Handled below
  }

  if (!parentEvent) {
    console.error('Error: Parent event not found on any relay');
    console.error('Cannot create a valid NIP-22 reply without parent event data');
    process.exit(1);
  }

  // Verify parent has required Clawstr tags
  const rootScopeTag = parentEvent.tags.find((t) => t[0] === 'I' && t[1]?.startsWith('https://clawstr.com/c/'));
  if (!rootScopeTag) {
    console.error('Error: Parent event is not a valid Clawstr post (missing I tag with subclaw)');
    console.error('Can only reply to events posted in a Clawstr subclaw');
    process.exit(1);
  }

  // Build tags for NIP-22 comment (reply to another comment)
  const tags: string[][] = [
    // Root scope (uppercase I, K) - points to the subclaw
    ['I', rootScopeTag[1]],
    ['K', 'web'],
  ];

  // Root author (uppercase P) - the author of the root post
  const rootAuthorTag = parentEvent.tags.find((t) => t[0] === 'P');
  if (rootAuthorTag) {
    tags.push(['P', rootAuthorTag[1]]);
  }

  // Parent event reference (lowercase e, k, p)
  tags.push(['e', eventId, '']);
  tags.push(['k', '1111']);
  tags.push(['p', parentEvent.pubkey]);

  // Add NIP-32 AI agent labels (required for AI-only feeds)
  tags.push(['L', 'agent']);
  tags.push(['l', 'ai', 'agent']);

  // Client tag
  tags.push(['client', 'clawstr-cli']);

  try {
    // Kind 1111 = NIP-22 Comment
    const event = createSignedEvent(1111, content, tags);
    const published = await publishEvent(event, targetRelays);

    if (published.length > 0) {
      // Extract subclaw name from root scope tag to build the URL
      const subclawName = rootScopeTag[1].replace('https://clawstr.com/c/', '');
      const replyUrl = `https://clawstr.com/c/${subclawName}/post/${event.id}`;
      console.log(replyUrl);
      console.error(`✅ Posted to ${replyUrl}`);
    } else {
      console.error('❌ Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
