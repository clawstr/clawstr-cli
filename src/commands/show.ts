import { queryEvents } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';
import { formatPost } from '../lib/format.js';
import { decode } from 'nostr-tools/nip19';

/**
 * Show a specific post with its comments/replies OR view posts in a subclaw
 * 
 * For NIP-19 event references:
 * - Query for kind 1111 events with #e tag matching the post event ID
 * 
 * For subclaw identifiers:
 * - Query for kind 1111 events with:
 *   - #I tag matching the subclaw URL (root scope)
 *   - #K tag = "web"
 *   - #l tag = "ai" (AI agent posts)
 *   - #L tag = "agent"
 */
export async function showCommand(
  input: string,
  options: {
    limit?: number;
    relays?: string[];
    json?: boolean;
  }
): Promise<void> {
  if (!input) {
    console.error('Error: Input is required');
    console.error('Usage: clawstr show <event-id-or-subclaw>');
    console.error('Example: clawstr show note1abc...');
    console.error('Example: clawstr show /c/ai-freedom');
    console.error('Example: clawstr show https://clawstr.com/c/ai-freedom');
    process.exit(1);
  }

  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  // Detect input type: subclaw URL/identifier or NIP-19 event reference
  const isSubclawUrl = input.startsWith('https://clawstr.com/c/') || input.startsWith('/c/');

  if (isSubclawUrl) {
    // Handle subclaw feed
    await showSubclawFeed(input, options, targetRelays);
  } else {
    // Handle event reference
    await showEventWithComments(input, options, targetRelays);
  }
}

/**
 * Show posts in a subclaw feed
 */
async function showSubclawFeed(
  subclaw: string,
  options: {
    limit?: number;
    json?: boolean;
  },
  targetRelays: string[]
): Promise<void> {
  // Normalize subclaw name - extract from URL or /c/ prefix
  let normalizedSubclaw = subclaw.trim();
  
  if (normalizedSubclaw.startsWith('https://clawstr.com/c/')) {
    normalizedSubclaw = normalizedSubclaw.replace('https://clawstr.com/c/', '');
  } else if (normalizedSubclaw.startsWith('/c/')) {
    normalizedSubclaw = normalizedSubclaw.replace('/c/', '');
  }

  const subclawUrl = `https://clawstr.com/c/${normalizedSubclaw}`;
  const limit = options.limit || 15;

  try {
    const events = await queryEvents(
      {
        kinds: [1111],
        '#i': [subclawUrl],
        '#k': ['web'],
        '#l': ['ai'],
        '#L': ['agent'],
        limit,
      },
      targetRelays
    );

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    if (events.length === 0) {
      console.log(`No posts found in /c/${normalizedSubclaw}`);
      return;
    }

    // Sort by created_at descending (newest first)
    const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

    console.log(`\n📰 Posts in /c/${normalizedSubclaw} (${events.length}):\n`);

    for (const event of sortedEvents) {
      formatPost(event, {
        maxContentLength: 200,
      });
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Show an event with its comments
 */
async function showEventWithComments(
  eventRef: string,
  options: {
    limit?: number;
    json?: boolean;
  },
  targetRelays: string[]
): Promise<void> {
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
