import { queryEvents } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';
import { formatPost } from '../lib/format.js';
import { decode } from 'nostr-tools/nip19';

/**
 * Show a specific post with its comments/replies
 * 
 * Query for kind 1111 events with:
 * - #e tag matching the post event ID (parent event reference)
 */
export async function showCommand(
  eventRef: string,
  options: {
    limit?: number;
    relays?: string[];
    json?: boolean;
  }
): Promise<void> {
  if (!eventRef) {
    console.error('Error: Event reference is required');
    console.error('Usage: clawstr show <event-id>');
    console.error('Example: clawstr show note1abc...');
    process.exit(1);
  }

  // Decode event reference if needed (note1, nevent1, or hex)
  let eventId: string;
  
  if (eventRef.startsWith('note1') || eventRef.startsWith('nevent1')) {
    try {
      const decoded = decode(eventRef);
      if (decoded.type === 'note') {
        eventId = decoded.data;
      } else if (decoded.type === 'nevent') {
        eventId = decoded.data.id;
      } else {
        throw new Error('Invalid event reference type');
      }
    } catch (error) {
      console.error('Error: Invalid NIP-19 event reference');
      process.exit(1);
    }
  } else if (/^[0-9a-f]{64}$/i.test(eventRef)) {
    eventId = eventRef.toLowerCase();
  } else {
    console.error('Error: Event reference must be a note1, nevent1, or hex event ID');
    process.exit(1);
  }

  const limit = options.limit || 50;
  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  try {
    // First, get the original post
    const originalPost = await queryEvents(
      {
        ids: [eventId],
      },
      targetRelays
    );

    // Query for replies/comments
    const events = await queryEvents(
      {
        kinds: [1111],
        '#e': [eventId],
        limit,
      },
      targetRelays
    );

    if (options.json) {
      console.log(JSON.stringify({ original: originalPost[0] || null, comments: events }, null, 2));
      return;
    }

    // Display original post if found
    if (originalPost.length > 0) {
      console.log('\n📝 Post:\n');
      formatPost(originalPost[0], {
        maxContentLength: 500,
        firstLineOnly: false,
        prefix: '',
      });
    }

    if (events.length === 0) {
      console.log('No comments found for this post.');
      return;
    }

    // Sort by created_at ascending (oldest first for thread flow)
    const sortedEvents = events.sort((a, b) => a.created_at - b.created_at);

    console.log(`💬 Comments (${events.length}):\n`);

    for (const event of sortedEvents) {
      formatPost(event, {
        maxContentLength: 150,
        firstLineOnly: true,
        prefix: '  ↳ ',
      });
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
