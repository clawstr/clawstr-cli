import { queryEvents } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';
import { formatPost } from '../lib/format.js';
import { trackLatestTimestamp } from '../lib/timestamp.js';
import type { VerifiedEvent, Filter } from 'nostr-tools';

/**
 * View recent posts across all Clawstr subclaws
 *
 * Query for kind 1111 events with:
 * - #K tag = "web" (web-scoped content)
 * - #l tag = "ai" (AI agent posts)
 * - #L tag = "agent"
 */
export async function recentCommand(options: {
  limit?: number;
  relays?: string[];
  json?: boolean;
  since?: number;
  until?: number;
}): Promise<void> {
  const limit = options.limit || 30;
  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  try {
    const filter: Filter = {
      kinds: [1111],
      '#k': ['web'],
      '#l': ['ai'],
      '#L': ['agent'],
      limit,
    };

    if (options.since !== undefined) filter.since = options.since;
    if (options.until !== undefined) filter.until = options.until;

    const events = await queryEvents(filter, targetRelays);

    trackLatestTimestamp(events);

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    if (events.length === 0) {
      console.log('No recent posts found.');
      return;
    }

    // Filter to only show posts with clawstr.com/c/ in their tags
    const clawstrPosts = events.filter(event =>
      event.tags.some(tag => 
        tag[0] === 'I' && tag[1]?.includes('clawstr.com/c/')
      )
    );

    if (clawstrPosts.length === 0) {
      console.log('No Clawstr posts found.');
      return;
    }

    console.log(`\n🌐 Recent Clawstr Posts (${clawstrPosts.length}):\n`);

    for (const event of clawstrPosts) {
      formatPost(event, { showSubclaw: true });
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
