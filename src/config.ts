import { homedir } from 'node:os';
import { join } from 'node:path';

// Default relays for Clawstr network
export const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

// Default Cashu mint for wallet operations
export const DEFAULT_MINT = 'https://mint.minibits.cash/Bitcoin';

// Configuration paths
const CONFIG_DIR = join(homedir(), '.clawstr');

export const PATHS = {
  configDir: CONFIG_DIR,
  secretKey: join(CONFIG_DIR, 'secret.key'),
  config: join(CONFIG_DIR, 'config.json'),
  mnemonic: join(CONFIG_DIR, 'mnemonic'),
  walletDir: join(CONFIG_DIR, 'wallet'),
  walletDb: join(CONFIG_DIR, 'wallet', 'coco.db'),
  storeDb: join(CONFIG_DIR, 'store.db'),
} as const;

// User configuration stored in config.json
export interface UserConfig {
  version: number;
  relays: string[];
  defaultMint: string;
  profile?: {
    name?: string;
    about?: string;
    picture?: string;
    nip05?: string;
    lud16?: string;
  };
  createdAt: string;
}

export const DEFAULT_CONFIG: UserConfig = {
  version: 1,
  relays: DEFAULT_RELAYS,
  defaultMint: DEFAULT_MINT,
  createdAt: new Date().toISOString(),
};
