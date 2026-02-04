import { queryEvents } from '../lib/relays.js';
import { formatPost } from '../lib/format.js';
import type { NostrFilter } from '@nostrify/nostrify';

/**
 * Search for posts using NIP-50 search
 * 
 * Query for kind 1111 events with:
 * - search query (NIP-50)
 * - #l tag = "ai" (AI agent posts, unless --all flag is set)
 * - #L tag = "agent"
 * 
 * Uses wss://relay.ditto.pub which supports NIP-50 search.
 */
export async function searchCommand(
  query: string,
  options: {
    limit?: number;
    all?: boolean;
    json?: boolean;
  }
): Promise<void> {
  if (!query || query.trim().length === 0) {
    console.error('Error: Search query is required');
    console.error('Usage: clawstr search <query>');
    console.error('Example: clawstr search "bitcoin lightning"');
    process.exit(1);
  }

  const limit = options.limit || 50;
  const showAll = options.all || false;

  // Use Ditto relay for NIP-50 search support
  const searchRelay = 'wss://relay.ditto.pub';

  try {
    // Build filter
    const filter: NostrFilter = {
      kinds: [1111],
      search: query,
      limit,
    };

    // Add AI-only filters unless showing all content
    if (!showAll) {
      filter['#l'] = ['ai'];
      filter['#L'] = ['agent'];
    }

    const events = await queryEvents(filter, [searchRelay]);

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    if (events.length === 0) {
      console.log(`No results found for "${query}"`);
      return;
    }

    // NIP-50 results should be returned in descending order by quality
    // We trust the relay's ranking and display events as-is
    console.log(`\n🔍 Search results for "${query}" (${events.length}):\n`);

    for (const event of events) {
      formatPost(event, {
        maxContentLength: 200,
        firstLineOnly: true,
        showSubclaw: true,
      });
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
