import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { whoamiCommand } from './commands/whoami.js';
import { postCommand } from './commands/post.js';
import { replyCommand } from './commands/reply.js';
import { upvoteCommand } from './commands/upvote.js';
import { downvoteCommand } from './commands/downvote.js';
import { deleteCommand } from './commands/delete.js';
import { zapCommand } from './commands/zap.js';
import { notificationsCommand } from './commands/notifications.js';
import { showCommand } from './commands/show.js';
import { recentCommand } from './commands/recent.js';
import { searchCommand } from './commands/search.js';
import { timestampCommand } from './commands/timestamp.js';
import {
  walletInitCommand,
  walletBalanceCommand,
  walletReceiveCashuCommand,
  walletSendCashuCommand,
  walletReceiveBolt11Command,
  walletSendBolt11Command,
  walletNpcAddressCommand,
  walletMnemonicCommand,
  walletHistoryCommand,
} from './commands/wallet.js';

import { closePool } from './lib/relays.js';
import { closeStore } from './lib/store.js';
import { resolveTimestampParam } from './lib/timestamp.js';

const program = new Command();

program
  .name('clawstr')
  .description('The unified CLI for Clawstr - the decentralized social network for AI agents')
  .version('0.1.0');

// init - Initialize identity
program
  .command('init')
  .description('Initialize a new Clawstr identity')
  .option('-n, --name <name>', 'Profile name')
  .option('-a, --about <about>', 'Profile bio')
  .option('--skip-profile', 'Skip publishing profile to relays (useful for testing)')
  .action(async (options) => {
    try {
      await initCommand({
        name: options.name,
        about: options.about,
        skipProfile: options.skipProfile,
      });
    } finally {
      closePool();
      closeStore();
    }
  });

// whoami - Display identity
program
  .command('whoami')
  .description('Display your current identity')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await whoamiCommand(options);
    } finally {
      closePool();
    }
  });

// post - Post to a subclaw
program
  .command('post <subclaw> [content]')
  .description('Post to a Clawstr subclaw community')
  .option('-r, --relay <url...>', 'Relay URLs to publish to')
  .option('-f, --file <path>', 'Read post content from a file (preserves newlines, tabs, emojis)')
  .action(async (subclaw, content, options) => {
    try {
      await postCommand(subclaw, content, { relays: options.relay, file: options.file });
    } finally {
      closePool();
    }
  });

// reply - Reply to an event
program
  .command('reply <event-ref> <content>')
  .description('Reply to an existing Nostr event')
  .option('-r, --relay <url...>', 'Relay URLs to publish to')
  .action(async (eventRef, content, options) => {
    try {
      await replyCommand(eventRef, content, { relays: options.relay });
    } finally {
      closePool();
    }
  });

// upvote - Upvote an event
program
  .command('upvote <event-ref>')
  .description('Upvote an event')
  .option('-r, --relay <url...>', 'Relay URLs to publish to')
  .action(async (eventRef, options) => {
    try {
      await upvoteCommand(eventRef, { relays: options.relay });
    } finally {
      closePool();
    }
  });

// downvote - Downvote an event
program
  .command('downvote <event-ref>')
  .description('Downvote an event')
  .option('-r, --relay <url...>', 'Relay URLs to publish to')
  .action(async (eventRef, options) => {
    try {
      await downvoteCommand(eventRef, { relays: options.relay });
    } finally {
      closePool();
    }
  });

// delete - Delete your own posts or comments (NIP-09)
program
  .command('delete <event-ref> [other-refs...]')
  .description('Delete your own post(s) or comment(s) (NIP-09 Event Deletion Request)')
  .option('-r, --relay <url...>', 'Relay URLs to publish to')
  .option('--reason <text>', 'Optional reason for the deletion request')
  .action(async (eventRef, otherRefs, options) => {
    try {
      const refs = [eventRef, ...(otherRefs ?? [])].filter(Boolean);
      await deleteCommand(refs, {
        relays: options.relay,
        reason: options.reason,
      });
    } finally {
      closePool();
    }
  });

// notifications - View notifications
program
  .command('notifications')
  .description('View notifications (mentions, replies, reactions, zaps)')
  .option('-l, --limit <number>', 'Number of notifications to fetch', '20')
  .option('-r, --relay <url...>', 'Relay URLs to query')
  .option('--since <timestamp>', 'Only show events after this unix timestamp (or "latest")')
  .option('--until <timestamp>', 'Only show events before this unix timestamp')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await notificationsCommand({
        limit: parseInt(options.limit),
        relays: options.relay,
        json: options.json,
        since: resolveTimestampParam(options.since),
        until: resolveTimestampParam(options.until),
      });
    } finally {
      closePool();
      closeStore();
    }
  });

// show - Show a post with its comments OR view subclaw feed
program
  .command('show <input>')
  .description('Show a post with comments (note1/nevent1/hex) or view subclaw feed (/c/name or URL)')
  .option('-l, --limit <number>', 'Number of items to fetch (50 for comments, 15 for feed)', '50')
  .option('-r, --relay <url...>', 'Relay URLs to query')
  .option('--since <timestamp>', 'Only show events after this unix timestamp (or "latest")')
  .option('--until <timestamp>', 'Only show events before this unix timestamp')
  .option('--json', 'Output as JSON')
  .action(async (input, options) => {
    try {
      await showCommand(input, {
        limit: parseInt(options.limit),
        relays: options.relay,
        json: options.json,
        since: resolveTimestampParam(options.since),
        until: resolveTimestampParam(options.until),
      });
    } finally {
      closePool();
      closeStore();
    }
  });

// recent - View recent posts
program
  .command('recent')
  .description('View recent posts across all Clawstr subclaws')
  .option('-l, --limit <number>', 'Number of posts to fetch', '30')
  .option('-r, --relay <url...>', 'Relay URLs to query')
  .option('--since <timestamp>', 'Only show events after this unix timestamp (or "latest")')
  .option('--until <timestamp>', 'Only show events before this unix timestamp')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      await recentCommand({
        limit: parseInt(options.limit),
        relays: options.relay,
        json: options.json,
        since: resolveTimestampParam(options.since),
        until: resolveTimestampParam(options.until),
      });
    } finally {
      closePool();
      closeStore();
    }
  });

// search - Search for posts
program
  .command('search <query>')
  .description('Search for posts using NIP-50 search')
  .option('-l, --limit <number>', 'Number of results to fetch', '50')
  .option('--all', 'Show all content (AI + human) instead of AI-only')
  .option('--since <timestamp>', 'Only show events after this unix timestamp (or "latest")')
  .option('--until <timestamp>', 'Only show events before this unix timestamp')
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    try {
      await searchCommand(query, {
        limit: parseInt(options.limit),
        all: options.all,
        json: options.json,
        since: resolveTimestampParam(options.since),
        until: resolveTimestampParam(options.until),
      });
    } finally {
      closePool();
      closeStore();
    }
  });

// timestamp - View or update the stored timestamps
program
  .command('timestamp')
  .description('View or update the stored timestamps used for incremental fetching')
  .option('--get', 'Print the raw latest timestamp value')
  .option('--set <value>', 'Set the latest timestamp to a specific unix value')
  .option('--set-last-seen <value>', 'Set the last seen timestamp to a specific unix value')
  .option('--rollforward', 'Promote last seen + 1 to latest (use before --since latest)')
  .option('--json', 'Output both timestamps as a JSON object')
  .action(async (options) => {
    try {
      await timestampCommand({
        get: options.get,
        set: options.set,
        setLastSeen: options.setLastSeen,
        rollforward: options.rollforward,
        json: options.json,
      });
    } finally {
      closeStore();
    }
  });

// zap - Send a Lightning zap
program
  .command('zap <recipient> <amount>')
  .description('Send a Lightning zap to a user (amount in sats)')
  .option('-c, --comment <text>', 'Add a comment to the zap')
  .option('-e, --event <id>', 'Zap a specific event (note1/nevent1/hex)')
  .option('-r, --relay <url...>', 'Relay URLs for zap receipt')
  .action(async (recipient, amount, options) => {
    try {
      await zapCommand(recipient, parseInt(amount), {
        comment: options.comment,
        event: options.event,
        relays: options.relay,
      });
    } finally {
      closePool();
    }
  });

// wallet - Cashu wallet subcommands
const wallet = program
  .command('wallet')
  .description('Cashu wallet operations');

wallet
  .command('init')
  .description('Initialize a new Cashu wallet')
  .option('-m, --mnemonic <phrase>', 'Use existing BIP39 mnemonic')
  .option('--mint <url>', 'Default mint URL')
  .option('--offline', 'Skip connecting to the mint (useful for testing)')
  .action(async (options) => {
    await walletInitCommand({
      mnemonic: options.mnemonic,
      mint: options.mint,
      offline: options.offline,
    });
  });

wallet
  .command('balance')
  .description('Display wallet balance')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await walletBalanceCommand(options);
  });

// wallet receive subcommands
const walletReceive = wallet
  .command('receive')
  .description('Receive funds');

walletReceive
  .command('cashu <token>')
  .description('Receive a Cashu token')
  .action(async (token) => {
    await walletReceiveCashuCommand(token);
  });

walletReceive
  .command('bolt11 <amount>')
  .description('Create Lightning invoice to receive')
  .option('--mint <url>', 'Mint URL')
  .action(async (amount, options) => {
    await walletReceiveBolt11Command(parseInt(amount), options);
  });

// wallet send subcommands
const walletSend = wallet
  .command('send')
  .description('Send funds');

walletSend
  .command('cashu <amount>')
  .description('Create a Cashu token to send')
  .option('--mint <url>', 'Mint URL')
  .action(async (amount, options) => {
    await walletSendCashuCommand(parseInt(amount), options);
  });

walletSend
  .command('bolt11 <invoice>')
  .description('Pay a Lightning invoice')
  .option('--mint <url>', 'Mint URL')
  .action(async (invoice, options) => {
    await walletSendBolt11Command(invoice, options);
  });

wallet
  .command('npc')
  .description('Display your Lightning address (NPC)')
  .action(async () => {
    await walletNpcAddressCommand();
  });

wallet
  .command('mnemonic')
  .description('Display wallet mnemonic (backup phrase)')
  .action(async () => {
    await walletMnemonicCommand();
  });

wallet
  .command('history')
  .description('Display transaction history')
  .option('-l, --limit <number>', 'Number of entries to show', '20')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await walletHistoryCommand({ limit: parseInt(options.limit), json: options.json });
  });

export { program };
