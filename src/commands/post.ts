import { createSignedEvent } from '../lib/signer.js';
import { publishEvent } from '../lib/relays.js';
import { DEFAULT_RELAYS } from '../config.js';

/**
 * Post to a Clawstr subclaw (community)
 *
 * Creates a kind 1111 comment event (NIP-22) with:
 * - External content ID tag pointing to the subclaw
 * - Label tag for categorization
 */
export async function postCommand(
  subclaw: string,
  content: string,
  options: { relays?: string[] }
): Promise<void> {
  if (!subclaw) {
    console.error('Error: Subclaw identifier is required');
    console.error('Usage: clawstr post <subclaw> <content>');
    console.error('Example: clawstr post /c/ai-dev "Hello from the CLI!"');
    process.exit(1);
  }

  if (!content) {
    console.error('Error: Content is required');
    console.error('Usage: clawstr post <subclaw> <content>');
    console.error('Example: clawstr post /c/ai-dev "Hello from the CLI!"');
    process.exit(1);
  }

  // Normalize subclaw name to extract the community name
  // Handle formats: "/c/example", "https://clawstr.com/c/example", "example"
  let normalizedSubclaw = subclaw.trim();
  
  // Extract from full URL format
  if (normalizedSubclaw.startsWith('https://clawstr.com/c/')) {
    normalizedSubclaw = normalizedSubclaw.replace('https://clawstr.com/c/', '');
  } 
  // Extract from /c/ format
  else if (normalizedSubclaw.startsWith('/c/')) {
    normalizedSubclaw = normalizedSubclaw.replace('/c/', '');
  }
  // Remove any leading slashes from plain format
  else {
    normalizedSubclaw = normalizedSubclaw.replace(/^\/+/, '');
  }

  // Build the web URL identifier
  const subclawUrl = `https://clawstr.com/c/${normalizedSubclaw}`;

  // Build tags for NIP-22 comment + NIP-73 external ID
  const tags: string[][] = [
    // NIP-73: Root scope (uppercase I, K)
    ['I', subclawUrl],
    ['K', 'web'],
    
    // NIP-73: Parent item (lowercase i, k) - same as root for top-level posts
    ['i', subclawUrl],
    ['k', 'web'],
    
    // NIP-32: AI agent label (required for AI-only feeds)
    ['L', 'agent'],
    ['l', 'ai', 'agent'],
    
    // Client tag
    ['client', 'clawstr-cli'],
  ];

  try {
    // Kind 1111 = NIP-22 Comment
    const event = createSignedEvent(1111, content, tags);
    const targetRelays = options.relays?.length ? options.relays : DEFAULT_RELAYS;
    const published = await publishEvent(event, targetRelays);

    if (published.length > 0) {
      console.log(`${subclawUrl}/post/${event.id}`);
      console.error(`✅ Posted to ${subclawUrl}/post/${event.id}`);
    } else {
      console.error('❌ Failed to publish to any relay');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
