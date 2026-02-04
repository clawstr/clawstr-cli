import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { getPublicKey } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { privateKeyFromSeedWords } from 'nostr-tools/nip06';
import { getDecodedToken } from 'coco-cashu-core';

import {
  isWalletInitialized,
  saveWalletConfig,
  createWalletConfig,
  loadWalletConfig,
  WALLET_PATHS,
} from '../lib/wallet/config.js';
import { getManager, closeManager, forceExit } from '../lib/wallet/manager.js';
import { DEFAULT_MINT } from '../config.js';

/**
 * Initialize wallet with new or existing mnemonic
 */
export async function walletInitCommand(options: {
  mnemonic?: string;
  mint?: string;
}): Promise<void> {
  if (isWalletInitialized()) {
    console.log('Wallet already initialized at', WALLET_PATHS.configDir);
    console.log('To reset, delete the wallet directory and run init again.');
    return;
  }

  console.log('Initializing Cashu wallet...\n');

  // Generate or validate mnemonic
  let mnemonic: string;
  if (options.mnemonic) {
    if (!validateMnemonic(options.mnemonic, wordlist)) {
      console.error('Error: Invalid mnemonic phrase');
      process.exit(1);
    }
    mnemonic = options.mnemonic;
    console.log('Using provided mnemonic');
  } else {
    mnemonic = generateMnemonic(wordlist, 256); // 24 words
    console.log('Generated new mnemonic (24 words)');
  }

  const mintUrl = options.mint || DEFAULT_MINT;

  // Create and save config
  const config = createWalletConfig(mnemonic, mintUrl);
  saveWalletConfig(config);

  console.log(`\nWallet config saved to ${WALLET_PATHS.config}`);

  // Initialize manager to set up database and NPC
  try {
    const manager = await getManager();

    // Get NPC Lightning address (suppress spurious output from plugin)
    const originalLog = console.log;
    console.log = () => {};
    const npcInfo = await manager.ext.npc.getInfo();
    console.log = originalLog;

    const npub = npubEncode(npcInfo.pubkey);
    const lightningAddress = npcInfo.name
      ? `${npcInfo.name}@npubx.cash`
      : `${npub}@npubx.cash`;

    console.log('\nWallet initialized successfully!');
    console.log(`  Mint: ${mintUrl}`);
    console.log(`  Lightning Address: ${lightningAddress}`);

    console.log('\nIMPORTANT: Back up your mnemonic phrase securely!');
    console.log('Run `clawstr wallet mnemonic` to display it.');

    console.log('\nNext steps:');
    console.log('  clawstr wallet balance      - Check your balance');
    console.log('  clawstr wallet receive      - Get tokens or invoice');
    console.log('  clawstr wallet send         - Send tokens or pay invoice');

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error initializing wallet:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Display wallet balance
 */
export async function walletBalanceCommand(options: { json?: boolean }): Promise<void> {
  try {
    const manager = await getManager();
    const balances = await manager.wallet.getBalances();

    if (options.json) {
      console.log(JSON.stringify(balances, null, 2));
      return;
    }

    const total = Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);

    if (total === 0) {
      console.log('Balance: 0 sats');
      console.log('\nTo receive funds:');
      console.log('  clawstr wallet receive cashu <token>');
      console.log('  clawstr wallet receive bolt11 <amount>');
    } else {
      console.log(`Total Balance: ${total} sats\n`);
      console.log('By Mint:');
      for (const [mintUrl, balance] of Object.entries(balances)) {
        if (balance && balance > 0) {
          console.log(`  ${mintUrl}: ${balance} sats`);
        }
      }
    }

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Receive Cashu token
 */
export async function walletReceiveCashuCommand(token: string): Promise<void> {
  if (!token) {
    console.error('Error: Token is required');
    console.error('Usage: clawstr wallet receive cashu <token>');
    process.exit(1);
  }

  try {
    const manager = await getManager();

    // Decode token to show amount
    const decoded = getDecodedToken(token);
    const amount = decoded.proofs.reduce(
      (sum: number, p: { amount: number }) => sum + p.amount,
      0
    );

    console.log(`Receiving ${amount} sats...`);

    // Receive the token
    await manager.wallet.receive(token);

    console.log(`Received ${amount} sats`);

    // Show new balance
    const balances = await manager.wallet.getBalances();
    const total = Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);
    console.log(`New balance: ${total} sats`);

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error receiving token:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Send Cashu token
 */
export async function walletSendCashuCommand(
  amount: number,
  options: { mint?: string }
): Promise<void> {
  if (!amount || amount <= 0) {
    console.error('Error: Amount must be a positive number');
    console.error('Usage: clawstr wallet send cashu <amount>');
    process.exit(1);
  }

  try {
    const manager = await getManager();
    const config = loadWalletConfig()!;
    const mintUrl = options.mint || config.mintUrl;

    console.log(`Preparing to send ${amount} sats...`);

    // Prepare send operation
    const prepared = await manager.send.prepareSend(mintUrl, amount);

    // Execute send
    const result = await manager.send.executePreparedSend(prepared.id);

    // Encode token
    const token = manager.wallet.encodeToken(result.token);

    console.log('\nCashu token (share this to send funds):');
    console.log(token);

    // Show remaining balance
    const balances = await manager.wallet.getBalances();
    const total = Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);
    console.log(`\nRemaining balance: ${total} sats`);

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error sending:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Create Lightning invoice to receive
 */
export async function walletReceiveBolt11Command(
  amount: number,
  options: { mint?: string }
): Promise<void> {
  if (!amount || amount <= 0) {
    console.error('Error: Amount must be a positive number');
    console.error('Usage: clawstr wallet receive bolt11 <amount>');
    process.exit(1);
  }

  try {
    const manager = await getManager();
    const config = loadWalletConfig()!;
    const mintUrl = options.mint || config.mintUrl;

    console.log(`Creating invoice for ${amount} sats...`);

    // Create mint quote (Lightning invoice)
    const quote = await manager.quotes.createMintQuote(mintUrl, amount);

    console.log('\nLightning Invoice:');
    console.log(quote.request);
    console.log(`\nAmount: ${amount} sats`);
    console.log('Pay this invoice to receive Cashu tokens.');
    console.log('\nAfter payment, the tokens will be automatically added to your wallet.');

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error creating invoice:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Pay Lightning invoice
 */
export async function walletSendBolt11Command(
  invoice: string,
  options: { mint?: string }
): Promise<void> {
  if (!invoice) {
    console.error('Error: Invoice is required');
    console.error('Usage: clawstr wallet send bolt11 <invoice>');
    process.exit(1);
  }

  try {
    const manager = await getManager();
    const config = loadWalletConfig()!;
    const mintUrl = options.mint || config.mintUrl;

    console.log('Preparing to pay invoice...');

    // Prepare melt (get quote)
    const prepared = await manager.quotes.prepareMeltBolt11(mintUrl, invoice);

    console.log(`Amount: ${prepared.amount} sats + ${prepared.fee_reserve} sats fee reserve`);
    console.log('Paying...');

    // Execute melt (pay invoice)
    await manager.quotes.executeMelt(prepared.id);

    console.log('Invoice paid successfully!');

    // Show remaining balance
    const balances = await manager.wallet.getBalances();
    const total = Object.values(balances).reduce((sum, bal) => sum + (bal || 0), 0);
    console.log(`Remaining balance: ${total} sats`);

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error paying invoice:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Display NPC Lightning address
 */
export async function walletNpcAddressCommand(): Promise<void> {
  try {
    const manager = await getManager();

    // Suppress spurious output from NPC plugin
    const originalLog = console.log;
    console.log = () => {};
    const npcInfo = await manager.ext.npc.getInfo();
    console.log = originalLog;

    const npub = npubEncode(npcInfo.pubkey);
    const address = npcInfo.name
      ? `${npcInfo.name}@npubx.cash`
      : `${npub}@npubx.cash`;

    console.log('Lightning Address:', address);
    console.log('\nAnyone can send Bitcoin to this address.');
    console.log('Payments are automatically converted to Cashu tokens.');

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}

/**
 * Display wallet mnemonic (for backup)
 */
export async function walletMnemonicCommand(): Promise<void> {
  const config = loadWalletConfig();
  if (!config) {
    console.error('Wallet not initialized. Run `clawstr wallet init` first.');
    process.exit(1);
  }

  console.log('MNEMONIC SEED PHRASE (KEEP SECRET!):\n');
  console.log(config.mnemonic);
  console.log('\nWARNING: Anyone with this phrase can access your funds.');
  console.log('Store it securely and never share it.');
}

/**
 * Display wallet history
 */
export async function walletHistoryCommand(options: {
  limit?: number;
  json?: boolean;
}): Promise<void> {
  try {
    const manager = await getManager();
    const limit = options.limit || 20;

    const history = await manager.history.getPaginatedHistory(0, limit);

    if (options.json) {
      console.log(JSON.stringify(history, null, 2));
    } else if (history.length === 0) {
      console.log('No transaction history yet.');
    } else {
      console.log('Transaction History:\n');
      for (const entry of history) {
        const date = new Date(entry.createdAt * 1000).toLocaleString();
        const sign = entry.type === 'receive' || entry.type === 'mint' ? '+' : '-';
        console.log(`${date} | ${entry.type.padEnd(8)} | ${sign}${entry.amount} sats`);
      }
    }

    closeManager();
    forceExit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    closeManager();
    forceExit(1);
  }
}
