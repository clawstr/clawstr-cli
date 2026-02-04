import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PATHS, DEFAULT_MINT } from '../../config.js';

/**
 * Wallet configuration stored in wallet-config.json
 */
export interface WalletConfig {
  version: number;
  mnemonic: string; // BIP39 mnemonic (plaintext for now, encryption later)
  encrypted: boolean;
  mintUrl: string;
  createdAt: string;
}

// Wallet-specific paths
export const WALLET_PATHS = {
  configDir: PATHS.walletDir,
  config: `${PATHS.walletDir}/config.json`,
  db: `${PATHS.walletDir}/wallet.db`,
} as const;

/**
 * Check if wallet is initialized
 */
export function isWalletInitialized(): boolean {
  return existsSync(WALLET_PATHS.config);
}

/**
 * Load wallet configuration
 */
export function loadWalletConfig(): WalletConfig | null {
  if (!existsSync(WALLET_PATHS.config)) {
    return null;
  }

  try {
    const content = readFileSync(WALLET_PATHS.config, 'utf-8');
    return JSON.parse(content) as WalletConfig;
  } catch {
    return null;
  }
}

/**
 * Save wallet configuration
 */
export function saveWalletConfig(config: WalletConfig): void {
  const dir = dirname(WALLET_PATHS.config);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(WALLET_PATHS.config, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Create default wallet config with mnemonic
 */
export function createWalletConfig(
  mnemonic: string,
  mintUrl: string = DEFAULT_MINT
): WalletConfig {
  return {
    version: 1,
    mnemonic,
    encrypted: false,
    mintUrl,
    createdAt: new Date().toISOString(),
  };
}
