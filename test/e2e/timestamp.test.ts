import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = join(__dirname, '../../dist/index.js');
const TEST_HOME = join(tmpdir(), 'clawstr-timestamp-e2e-' + process.pid);

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

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Process timed out'));
    }, options.timeout || 10000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
    });
  });
}

describe('clawstr timestamp e2e', () => {
  beforeEach(() => {
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true });
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true });
  });

  // ── No options: human-readable status ──────────────────────────────────────

  describe('clawstr timestamp (no options)', () => {
    it('should show "not set" for both timestamps when nothing stored', async () => {
      const { stdout, code } = await runCli(['timestamp']);

      expect(code).toBe(0);
      expect(stdout).toContain('Timestamp status');
      expect(stdout).toContain('not set');
    });

    it('should display latest timestamp after --set', async () => {
      await runCli(['timestamp', '--set', '1700000000']);
      const { stdout, code } = await runCli(['timestamp']);

      expect(code).toBe(0);
      expect(stdout).toContain('1700000000');
    });

    it('should display last seen timestamp after --set-last-seen', async () => {
      await runCli(['timestamp', '--set-last-seen', '1700000001']);
      const { stdout, code } = await runCli(['timestamp']);

      expect(code).toBe(0);
      expect(stdout).toContain('1700000001');
    });
  });

  // ── --set ──────────────────────────────────────────────────────────────────

  describe('clawstr timestamp --set', () => {
    it('should set the latest timestamp to a specific value', async () => {
      const { stdout, code } = await runCli(['timestamp', '--set', '1700000000']);

      expect(code).toBe(0);
      expect(stdout).toContain('1700000000');
    });

    it('should overwrite a previously set timestamp', async () => {
      await runCli(['timestamp', '--set', '1700000000']);
      const { stdout, code } = await runCli(['timestamp', '--set', '1710000000']);

      expect(code).toBe(0);
      expect(stdout).toContain('1710000000');
    });

    it('should accept 0 as a valid timestamp', async () => {
      const { stdout, code } = await runCli(['timestamp', '--set', '0']);

      expect(code).toBe(0);
      expect(stdout).toContain('0');
    });

    it('should fail with a non-numeric value', async () => {
      const { stderr, code } = await runCli(['timestamp', '--set', 'not-a-number']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('Invalid timestamp value');
    });

    it('should persist the value across separate CLI invocations', async () => {
      await runCli(['timestamp', '--set', '1700000000']);
      const { stdout, code } = await runCli(['timestamp']);

      expect(code).toBe(0);
      expect(stdout).toContain('1700000000');
    });
  });

  // ── --set-last-seen ────────────────────────────────────────────────────────

  describe('clawstr timestamp --set-last-seen', () => {
    it('should set the last seen timestamp to a specific value', async () => {
      const { stdout, code } = await runCli(['timestamp', '--set-last-seen', '1700000005']);

      expect(code).toBe(0);
      expect(stdout).toContain('1700000005');
    });

    it('should fail with a non-numeric value', async () => {
      const { stderr, code } = await runCli(['timestamp', '--set-last-seen', 'bad']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('Invalid timestamp value');
    });

    it('should persist across invocations', async () => {
      await runCli(['timestamp', '--set-last-seen', '1700000005']);
      const { stdout } = await runCli(['timestamp']);

      expect(stdout).toContain('1700000005');
    });
  });

  // ── --rollforward ──────────────────────────────────────────────────────────

  describe('clawstr timestamp --rollforward', () => {
    it('should default to 0 when no last_seen has been recorded', async () => {
      const { stdout, code } = await runCli(['timestamp', '--rollforward']);

      expect(code).toBe(0);
      expect(stdout).toContain('0');
    });

    it('should set latest to last_seen + 1', async () => {
      await runCli(['timestamp', '--set-last-seen', '1700000010']);
      const { stdout, code } = await runCli(['timestamp', '--rollforward']);

      expect(code).toBe(0);
      expect(stdout).toContain('1700000011');
    });

    it('should persist the rolled-forward value as latest', async () => {
      await runCli(['timestamp', '--set-last-seen', '1700000010']);
      await runCli(['timestamp', '--rollforward']);
      const { stdout } = await runCli(['timestamp', '--get']);

      expect(stdout.trim()).toBe('1700000011');
    });
  });

  // ── --get ──────────────────────────────────────────────────────────────────

  describe('clawstr timestamp --get', () => {
    it('should print "not set" when no latest timestamp stored', async () => {
      const { stdout, code } = await runCli(['timestamp', '--get']);

      expect(code).toBe(0);
      expect(stdout.trim()).toBe('not set');
    });

    it('should print the raw numeric value after --set', async () => {
      await runCli(['timestamp', '--set', '1700000000']);
      const { stdout, code } = await runCli(['timestamp', '--get']);

      expect(code).toBe(0);
      expect(stdout.trim()).toBe('1700000000');
    });
  });

  // ── --json ─────────────────────────────────────────────────────────────────

  describe('clawstr timestamp --json', () => {
    it('should output valid JSON with null values when nothing stored', async () => {
      const { stdout, code } = await runCli(['timestamp', '--json']);

      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.latest).toBeNull();
      expect(parsed.lastSeen).toBeNull();
    });

    it('should include latest after --set', async () => {
      await runCli(['timestamp', '--set', '1700000000']);
      const { stdout, code } = await runCli(['timestamp', '--json']);

      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.latest).toBe(1700000000);
      expect(parsed.lastSeen).toBeNull();
    });

    it('should include both values when both are set', async () => {
      await runCli(['timestamp', '--set', '1700000000']);
      await runCli(['timestamp', '--set-last-seen', '1699999999']);
      const { stdout, code } = await runCli(['timestamp', '--json']);

      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.latest).toBe(1700000000);
      expect(parsed.lastSeen).toBe(1699999999);
    });
  });

  // ── --since latest integration ─────────────────────────────────────────────

  describe('--since latest integration', () => {
    it('should fail with error when --since latest has no stored value', async () => {
      const { stderr, code } = await runCli(['recent', '--since', 'latest']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('No "latest" timestamp stored');
    });

    it('should succeed after --set provides a latest value', async () => {
      const farFuture = String(Math.floor(Date.now() / 1000) + 9999999);
      await runCli(['timestamp', '--set', farFuture]);
      const { code } = await runCli(['recent', '--since', 'latest'], { timeout: 15000 });

      expect(code).toBe(0);
    });

    it('should accept --since with a numeric value without error (may return no results)', async () => {
      const farFuture = String(Math.floor(Date.now() / 1000) + 9999999);
      const { code } = await runCli(['recent', '--since', farFuture], { timeout: 15000 });

      expect(code).toBe(0);
    });
  });
});
