import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = join(__dirname, '../../dist/index.js');
const TEST_HOME = join(tmpdir(), 'clawstr-wallet-test-' + process.pid);
const WALLET_DIR = join(TEST_HOME, '.clawstr', 'wallet');

// Test mnemonic (DO NOT USE IN PRODUCTION)
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

function runCli(
  args: string[],
  options: { timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI_PATH, ...args], {
      // Set both HOME and USERPROFILE so os.homedir() resolves correctly on Windows and Unix
      env: { ...process.env, HOME: TEST_HOME, USERPROFILE: TEST_HOME },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Process timed out'));
    }, options.timeout || 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

describe('wallet integration tests', () => {
  beforeEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_HOME)) {
      rmSync(TEST_HOME, { recursive: true });
    }
  });

  describe('wallet init', () => {
    it('should generate new mnemonic when none provided', async () => {
      // Use --offline to skip network call to the mint
      const { stdout, code } = await runCli(['wallet', 'init', '--offline']);

      expect(code).toBe(0);
      expect(stdout).toContain('Initializing');
      expect(existsSync(join(WALLET_DIR, 'config.json'))).toBe(true);
    });

    it('should use provided mnemonic', async () => {
      const { code } = await runCli(
        ['wallet', 'init', '--mnemonic', TEST_MNEMONIC, '--offline'],
      );

      expect(code).toBe(0);

      const configPath = join(WALLET_DIR, 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mnemonic).toBe(TEST_MNEMONIC);
    });

    it('should reject invalid mnemonic', async () => {
      const { stderr, code } = await runCli(
        ['wallet', 'init', '--mnemonic', 'invalid mnemonic phrase', '--offline'],
      );

      expect(code).not.toBe(0);
      expect(stderr).toContain('Invalid mnemonic');
    });

    it('should warn when already initialized', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC, '--offline']);
      const { stdout, code } = await runCli(['wallet', 'init', '--offline']);

      expect(code).toBe(0);
      expect(stdout).toContain('already initialized');
    });

    it('should use custom mint URL', async () => {
      const customMint = 'https://custom.mint.test/Bitcoin';
      const { code } = await runCli(
        ['wallet', 'init', '--mnemonic', TEST_MNEMONIC, '--mint', customMint, '--offline'],
      );

      expect(code).toBe(0);

      const configPath = join(WALLET_DIR, 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mintUrl).toBe(customMint);
    });
  });

  describe('wallet mnemonic', () => {
    it('should fail when wallet not initialized', async () => {
      const { stderr, code } = await runCli(['wallet', 'mnemonic']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('not initialized');
    });

    it('should display mnemonic after init', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC, '--offline']);
      const { stdout, code } = await runCli(['wallet', 'mnemonic']);

      expect(code).toBe(0);
      expect(stdout).toContain(TEST_MNEMONIC);
      expect(stdout).toContain('KEEP SECRET');
    });
  });

  describe('wallet balance', () => {
    // Skip: wallet balance calls getManager() which makes live network calls to the mint
    it.skip('should show zero balance for new wallet (requires live mint)', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC]);
      const { stdout, code } = await runCli(['wallet', 'balance'], { timeout: 30000 });

      expect(code).toBe(0);
      expect(stdout).toContain('0 sats');
    });

    // Skip this test - it's flaky due to NPC WebSocket keeping the process alive
    it.skip('should output JSON with --json flag (flaky - NPC WebSocket)', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC]);
      const { stdout, code } = await runCli(['wallet', 'balance', '--json'], { timeout: 60000 });

      expect(code).toBe(0);
      const balance = JSON.parse(stdout);
      expect(typeof balance).toBe('object');
    }, 90000);
  });

  describe('wallet history', () => {
    // Skip: wallet history calls getManager() which makes live network calls to the mint
    it.skip('should show empty history for new wallet (requires live mint)', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC]);
      const { stdout, code } = await runCli(['wallet', 'history'], { timeout: 30000 });

      expect(code).toBe(0);
      expect(stdout).toContain('No transaction history');
    });

    it.skip('should output JSON with --json flag (requires live mint)', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC]);
      const { stdout, code } = await runCli(['wallet', 'history', '--json'], { timeout: 30000 });

      expect(code).toBe(0);
      const history = JSON.parse(stdout);
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('wallet config persistence', () => {
    it('should create config.json with correct structure', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC, '--offline']);

      const configPath = join(WALLET_DIR, 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));

      expect(config.version).toBe(1);
      expect(config.mnemonic).toBeDefined();
      expect(config.mintUrl).toBeDefined();
      expect(config.encrypted).toBe(false);
      expect(config.createdAt).toBeDefined();
    });

    it('should maintain mnemonic across commands', async () => {
      await runCli(['wallet', 'init', '--mnemonic', TEST_MNEMONIC, '--offline']);

      const configPath = join(WALLET_DIR, 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(config.mnemonic).toBe(TEST_MNEMONIC);
    });
  });
});
