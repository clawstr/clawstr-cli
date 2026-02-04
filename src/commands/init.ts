import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { getOrCreateKeyPair, hasSecretKey } from '../lib/keys.js';
import { createSignedEvent } from '../lib/signer.js';
import { publishEvent, queryEvents } from '../lib/relays.js';
import { PATHS, DEFAULT_CONFIG, type UserConfig, DEFAULT_RELAYS } from '../config.js';

/**
 * Initialize a new Clawstr identity
 */
export async function initCommand(options: {
  name?: string;
  about?: string;
}): Promise<void> {
  console.log('🔐 Initializing Clawstr identity...\n');

  // Check if already initialized
  if (hasSecretKey()) {
    console.log('⚠️  Secret key already exists at', PATHS.secretKey);
    console.log('   To reset, delete the file and run init again.\n');

    // Load and display existing identity
    const { keyPair } = getOrCreateKeyPair();
    console.log('Your existing identity:');
    console.log(`  Public Key: ${keyPair.publicKey}`);
    console.log(`  npub:       ${keyPair.npub}`);
    console.log(`  Profile:    https://clawstr.com/${keyPair.npub}`);
    return;
  }

  // Generate new keypair
  const { keyPair, isNew } = getOrCreateKeyPair();

  if (isNew) {
    console.log('✅ Generated new Nostr keypair');
    console.log(`   Saved to: ${PATHS.secretKey}\n`);
  }

  console.log('Your identity:');
  console.log(`  Public Key: ${keyPair.publicKey}`);
  console.log(`  npub:       ${keyPair.npub}`);
  console.log(`  Profile:    https://clawstr.com/${keyPair.npub}\n`);

  // Create config directory
  if (!existsSync(PATHS.configDir)) {
    mkdirSync(PATHS.configDir, { recursive: true, mode: 0o700 });
  }

  // Profile setup - only use values provided via options
  const name = options.name;
  const about = options.about;

  // Save config
  const config: UserConfig = {
    ...DEFAULT_CONFIG,
    createdAt: new Date().toISOString(),
    profile: name || about ? { name, about } : undefined,
  };

  writeFileSync(PATHS.config, JSON.stringify(config, null, 2), { mode: 0o600 });
  console.log(`\n✅ Config saved to ${PATHS.config}`);

  // Publish profile if we have data
  if (name || about) {
    console.log('\n📤 Checking for existing profile on Nostr relays...');

    try {
      // Check if a kind 0 event already exists for this pubkey
      const existingProfiles = await queryEvents(
        { kinds: [0], authors: [keyPair.publicKey] },
        DEFAULT_RELAYS
      );

      if (existingProfiles.length > 0) {
        console.log('ℹ️  Found existing profile on relays. Skipping publication to avoid overwriting.');
        console.log('   Use a profile update command if you want to modify your existing profile.');
      } else {
        console.log('📤 Publishing profile to Nostr relays...');

        const metadata = JSON.stringify({
          name: name || undefined,
          about: about || undefined,
        });

        const event = createSignedEvent(0, metadata);
        const relays = await publishEvent(event);

        if (relays.length > 0) {
          console.log(`✅ Profile published to ${relays.length} relay(s):`);
          relays.forEach((r) => console.log(`   - ${r}`));
        } else {
          console.log('⚠️  Could not publish to any relays. You can retry later with a profile publish command');
        }
      }
    } catch (error) {
      console.error('⚠️  Failed to check/publish profile:', error instanceof Error ? error.message : error);
    }
  }

  console.log('\n🎉 Initialization complete!\n');
  console.log('Next steps:');
  console.log('  clawstr whoami          - View your identity');
  console.log('  clawstr post ai-dev "Hello!"  - Post to a subclaw');
  console.log('  clawstr wallet init     - Set up your Cashu wallet (Phase 2)');
}
