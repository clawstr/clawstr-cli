import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { mnemonicToSeedSync } from '@scure/bip39';
import { initializeCoco, type Manager } from 'coco-cashu-core';
import { SqliteRepositories } from 'coco-cashu-sqlite3';
import { NPCPlugin } from 'coco-cashu-plugin-npc';
import { privateKeyFromSeedWords } from 'nostr-tools/nip06';
import { finalizeEvent, type EventTemplate } from 'nostr-tools/pure';
import sqlite3 from 'sqlite3';

import {
  WALLET_PATHS,
  loadWalletConfig,
  isWalletInitialized,
  type WalletConfig,
} from './config.js';

// Singleton manager instance
let managerInstance: Manager | null = null;
let currentConfig: WalletConfig | null = null;

/**
 * Silent logger - suppresses all output unless DEBUG is set
 */
const logger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  log: (..._args: unknown[]) => {},
};

/**
 * Initialize the Cashu wallet manager
 */
export async function initializeManager(config: WalletConfig): Promise<Manager> {
  // Ensure wallet directory exists
  const dbDir = dirname(WALLET_PATHS.db);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  }

  // Derive seed from mnemonic
  const seed = mnemonicToSeedSync(config.mnemonic);

  // Initialize SQLite database
  const db = new sqlite3.Database(WALLET_PATHS.db);

  // Create repositories
  const repo = new SqliteRepositories({ database: db });

  // Derive Nostr private key from mnemonic (NIP-06)
  const sk = privateKeyFromSeedWords(config.mnemonic);

  // Create Nostr event signer for NPC
  const signer = async (t: EventTemplate) => finalizeEvent(t, sk);

  // Initialize NPC plugin for Lightning address
  const npcPlugin = new NPCPlugin('https://npubx.cash', signer, {
    useWebsocket: true,
    logger,
  });

  // Initialize coco wallet
  const coco = await initializeCoco({
    repo,
    seedGetter: async () => seed,
    logger,
  });

  // Register NPC plugin
  coco.use(npcPlugin);

  // Add default mint as trusted
  try {
    await coco.mint.addMint(config.mintUrl, { trusted: true });
  } catch (error) {
    // Mint may already exist, that's fine
    logger.debug('Mint add result:', error);
  }

  return coco;
}

/**
 * Get or create the wallet manager instance
 */
export async function getManager(): Promise<Manager> {
  if (!isWalletInitialized()) {
    throw new Error('Wallet not initialized. Run `clawstr wallet init` first.');
  }

  const config = loadWalletConfig();
  if (!config) {
    throw new Error('Failed to load wallet configuration.');
  }

  // Return cached instance if config hasn't changed
  if (managerInstance && currentConfig?.mnemonic === config.mnemonic) {
    return managerInstance;
  }

  // Initialize new manager
  managerInstance = await initializeManager(config);
  currentConfig = config;

  return managerInstance;
}

/**
 * Close the wallet manager and release resources
 */
export function closeManager(): void {
  // Clear our references
  managerInstance = null;
  currentConfig = null;
}

/**
 * Force exit the process
 * Needed because NPC WebSocket keeps the process alive
 */
export function forceExit(exitCode: number = 0): void {
  process.exit(exitCode);
}

/**
 * Get the current wallet config (requires wallet to be initialized)
 */
export function getWalletConfig(): WalletConfig {
  const config = loadWalletConfig();
  if (!config) {
    throw new Error('Wallet not initialized. Run `clawstr wallet init` first.');
  }
  return config;
}
