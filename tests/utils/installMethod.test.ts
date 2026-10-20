import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { detectInstallMethod, getUpdateCommand } from '../../src/utils/installMethod.js';

describe('installation-aware updates', () => {
  it.each([
    ['/opt/homebrew/Cellar/autohand-code/0.9.8/bin/autohand', 'brew'],
    ['/usr/local/lib/node_modules/autohand-cli/dist/index.js', 'npm'],
    ['C:\\Users\\fixture\\AppData\\Roaming\\npm\\node_modules\\autohand-cli\\dist\\index.js', 'npm'],
    ['/Users/fixture/.bun/install/global/node_modules/autohand-cli/dist/index.js', 'bun'],
    ['/Users/fixture/.local/bin/autohand', 'standalone'],
  ] as const)('detects %s as %s', (entrypoint, expected) => {
    expect(detectInstallMethod({ entrypoint, executable: '/usr/bin/node' })).toBe(expected);
  });

  it('follows a launcher symlink to the npm package', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'install-method-'));
    try {
      const target = path.join(root, 'node_modules/autohand-cli/dist/index.js');
      const launcher = path.join(root, 'autohand');
      await fs.outputFile(target, '');
      await fs.symlink(target, launcher);
      expect(detectInstallMethod({ entrypoint: launcher, executable: '/usr/bin/node' })).toBe('npm');
    } finally {
      await fs.remove(root);
    }
  });

  it.each(['npm', 'bun'] as const)('keeps %s updates on the installed package manager and release channel', method => {
    const stable = getUpdateCommand('stable', { method, platform: 'linux' });
    expect(stable.command).toBe(method);
    expect(stable.args).toContain('autohand-cli@latest');
    const alpha = getUpdateCommand('alpha', { method, platform: 'linux' });
    expect(alpha.args).toContain('autohand-cli@alpha');
    expect(alpha.hint).toBe([alpha.command, ...alpha.args].join(' '));
  });

  it('keeps Homebrew installs on Homebrew', () => {
    expect(getUpdateCommand('stable', { method: 'brew', platform: 'darwin' })).toMatchObject({
      command: 'brew', args: ['upgrade', 'autohandai/code/autohand-code'],
    });
  });

  it('uses PowerShell for standalone Windows updates, including alpha', () => {
    const stable = getUpdateCommand('stable', { method: 'standalone', platform: 'win32' });
    expect(stable.command).toBe('powershell.exe');
    expect(stable.hint).toContain('install.ps1');
    expect(stable.args.at(-1)).not.toContain('-Alpha');
    expect(getUpdateCommand('alpha', { method: 'standalone', platform: 'win32' }).args.at(-1)).toContain('-Alpha');
  });

  it('uses the shell installer only for standalone Unix updates', () => {
    expect(getUpdateCommand('stable', { method: 'standalone', platform: 'linux' })).toMatchObject({ command: 'sh', args: ['-c', 'curl -fsSL https://autohand.ai/install.sh | sh'] });
    expect(getUpdateCommand('alpha', { method: 'standalone', platform: 'darwin' }).hint).toContain('--alpha');
  });
});
