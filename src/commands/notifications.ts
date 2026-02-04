import { queryEvents } from '../lib/relays.js';
import { loadKeyPair } from '../lib/keys.js';
import { DEFAULT_RELAYS } from '../config.js';
import { formatPost } from '../lib/format.js';
import type { VerifiedEvent } from 'nostr-tools';

/**
 * View notifications (mentions, replies, reactions, zaps)
 * 
 * Query for:
 * - Kind 1111 (comments/replies) with your pubkey in p tag
 * - Kind 7 (reactions) with your pubkey in p tag
 * - Kind 9735 (zaps) with your pubkey in p tag
 */
export async function notificationsCommand(options: {
  limit?: number;
  relays?: string[];
  json?: boolean;
}): Promise<void> {
  const keyPair = loadKeyPair();
  if (!keyPair) {
    console.error('Error: No identity found. Run `clawstr init` first.');
    process.exit(1);
  }

  const limit = options.limit || 20;
  const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;

  try {
    // Query for notifications
    const events = await queryEvents(
      {
        kinds: [1111, 7, 9735],
        '#p': [keyPair.publicKey],
        limit,
      },
      targetRelays
    );

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
      return;
    }

    if (events.length === 0) {
      console.log('No notifications found.');
      return;
    }

    // Sort by created_at descending (newest first)
    const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

    console.log(`\n📬 Notifications (${events.length}):\n`);

    for (const event of sortedEvents) {
      formatNotification(event);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function formatNotification(event: VerifiedEvent): void {
  const timestamp = new Date(event.created_at * 1000).toLocaleString();
  const author = event.pubkey.substring(0, 8);

  if (event.kind === 1111) {
    // Reply/mention - use unified formatter with custom settings
    formatPost(event, {
      maxContentLength: 80,
      prefix: '💬 ',
    });
  } else if (event.kind === 7) {
    // Reaction
    const reaction = event.content || '+';
    console.log(`${reaction === '+' ? '👍' : '👎'} Reaction from ${author}: ${reaction}`);
    console.log(`   ${timestamp}`);
    console.log(`   Event: ${event.id}`);
    console.log('');
  } else if (event.kind === 9735) {
    // Zap receipt
    const amountTag = event.tags.find(t => t[0] === 'amount');
    const amount = amountTag ? parseInt(amountTag[1]) / 1000 : 'unknown';
    console.log(`⚡ Zap from ${author}: ${amount} sats`);
    console.log(`   ${timestamp}`);
    console.log(`   Event: ${event.id}`);
    console.log('');
  }
}
