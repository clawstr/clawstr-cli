import type { VerifiedEvent } from 'nostr-tools';
import { encodeNote } from './nip19.js';

/**
 * Options for formatting a post
 */
export interface FormatPostOptions {
  /** Maximum length for content truncation (default: 150) */
  maxContentLength?: number;
  /** Whether to show only the first line of content (default: true) */
  firstLineOnly?: boolean;
  /** Whether to show the subclaw information (default: false) */
  showSubclaw?: boolean;
  /** Custom prefix for the post (overrides reply detection) */
  prefix?: string;
  /** Whether this is a reply (auto-detected if prefix not provided) */
  isReply?: boolean;
}

/**
 * Format a Nostr event as a post for display
 * Based on the formatting logic from the recent command
 * 
 * @param event - The verified Nostr event to format
 * @param options - Optional formatting configuration
 */
export function formatPost(event: VerifiedEvent, options: FormatPostOptions = {}): void {
  const {
    maxContentLength = 150,
    firstLineOnly = true,
    showSubclaw = false,
    prefix: customPrefix,
  } = options;

  const timestamp = new Date(event.created_at * 1000).toLocaleString();
  const author = event.pubkey.substring(0, 8);
  
  // Get content (first line only if specified)
  let content = firstLineOnly 
    ? event.content.split(/\r?\n/)[0].trim()
    : event.content.trim();

  // Truncate content if needed
  content = content.length > maxContentLength
    ? content.substring(0, maxContentLength - 3) + '...'
    : content;

  // Determine prefix
  let prefix: string;
  if (customPrefix !== undefined) {
    prefix = customPrefix;
  } else {
    // Check if this is a reply
    const isReply = options.isReply ?? event.tags.some(t => t[0] === 'e');
    prefix = isReply ? '• ↳ ' : '• ';
  }

  // Build the header line
  let header = `${prefix}`;
  
  // Add subclaw if requested
  if (showSubclaw) {
    const iTag = event.tags.find(t => t[0] === 'I' && t[1]?.includes('clawstr.com/c/'));
    const subclaw = iTag && iTag[1] 
      ? iTag[1].replace('https://clawstr.com/c/', '/c/')
      : 'unknown';
    header += `${subclaw} • `;
  }
  
  header += `${author} • ${timestamp}`;

  // Encode event ID to NIP-19 note format
  const noteId = encodeNote(event.id);

  // Output formatted post
  console.log(header);
  console.log(`  ${content}`);
  console.log(`  ID: ${noteId}`);
  console.log('');
}
