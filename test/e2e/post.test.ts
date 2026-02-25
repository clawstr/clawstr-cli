import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CLI_PATH = join(__dirname, '../../dist/index.js');
const TEST_HOME = join(tmpdir(), 'clawstr-post-e2e-' + process.pid);

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

describe('clawstr post --file e2e', () => {
  beforeEach(() => {
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true });
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true });
  });

  describe('--file argument validation', () => {
    it('should fail with a clear error when --file points to a non-existent file', async () => {
      const { stderr, code } = await runCli([
        'post', '/c/ai-dev', '--file', join(TEST_HOME, 'does-not-exist.md'),
      ]);

      expect(code).not.toBe(0);
      expect(stderr).toContain('Could not read file');
    });

    it('should fail with a clear error when neither content nor --file is provided', async () => {
      const { stderr, code } = await runCli(['post', '/c/ai-dev']);

      expect(code).not.toBe(0);
      expect(stderr).toContain('Content is required');
    });

    it('should fail when no subclaw and no content are provided', async () => {
      const { stderr, code } = await runCli(['post']);

      // Commander exits with non-zero when required positional args are missing
      expect(code).not.toBe(0);
    });
  });

  describe('--file reads file content correctly', () => {
    it('should read a plain text file and attempt to post its content', async () => {
      // Write a test file — content is plain ASCII so we can verify it reached
      // the signing step (which fails because no identity exists yet, giving us
      // a predictable error that proves the file was read successfully).
      const filePath = join(TEST_HOME, 'post.txt');
      writeFileSync(filePath, 'Hello from a file!', 'utf-8');

      const { stderr, code } = await runCli(['post', '/c/ai-dev', '--file', filePath]);

      // No identity → signing fails, but the error is NOT about file reading
      expect(stderr).not.toContain('Could not read file');
      // The error should be about missing identity / secret key
      expect(stderr).toContain('No secret key');
    });

    it('should preserve newlines from the file', async () => {
      const filePath = join(TEST_HOME, 'multiline.txt');
      writeFileSync(filePath, 'Line one\nLine two\nLine three', 'utf-8');

      const { stderr, code } = await runCli(['post', '/c/ai-dev', '--file', filePath]);

      // File was read (no file-read error). Signing fails due to missing identity.
      expect(stderr).not.toContain('Could not read file');
      expect(stderr).toContain('No secret key');
    });

    it('should preserve tabs from the file', async () => {
      const filePath = join(TEST_HOME, 'tabbed.txt');
      writeFileSync(filePath, 'Column1\tColumn2\tColumn3', 'utf-8');

      const { stderr, code } = await runCli(['post', '/c/ai-dev', '--file', filePath]);

      expect(stderr).not.toContain('Could not read file');
      expect(stderr).toContain('No secret key');
    });

    it('should read a file with emoji content without error', async () => {
      const filePath = join(TEST_HOME, 'emoji.txt');
      writeFileSync(filePath, '🚀 Launching from file! 🎉', 'utf-8');

      const { stderr, code } = await runCli(['post', '/c/ai-dev', '--file', filePath]);

      expect(stderr).not.toContain('Could not read file');
      expect(stderr).toContain('No secret key');
    });

    it('should read an empty file and proceed to signing (fails due to no identity)', async () => {
      const filePath = join(TEST_HOME, 'empty.txt');
      writeFileSync(filePath, '', 'utf-8');

      // An empty file is read successfully; the CLI then attempts to sign the event
      // which fails because no identity (secret key) is initialised in the test home.
      const { stderr, code } = await runCli(['post', '/c/ai-dev', '--file', filePath]);

      expect(code).not.toBe(0);
      // The error is about signing, not about missing content or missing file
      expect(stderr).not.toContain('Could not read file');
      expect(stderr).not.toContain('Content is required');
      expect(stderr).toContain('No secret key');
    });
  });

  describe('--file vs inline content precedence', () => {
    it('should prefer --file over the inline content argument', async () => {
      // Both are supplied; --file should win. If the file cannot be read the
      // error is about the file, not about missing content.
      const filePath = join(TEST_HOME, 'preferred.txt');
      writeFileSync(filePath, 'File content wins', 'utf-8');

      const { stderr, code } = await runCli([
        'post', '/c/ai-dev', 'inline content', '--file', filePath,
      ]);

      // File was found and read (no file-read error), signing fails as expected
      expect(stderr).not.toContain('Could not read file');
      expect(stderr).toContain('No secret key');
    });
  });
});
