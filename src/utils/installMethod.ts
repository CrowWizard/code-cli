import { realpathSync } from 'node:fs';
import os from 'node:os';
import type { ReleaseChannel } from './versionCheck.js';

type InstallMethod = 'npm' | 'bun' | 'brew' | 'standalone';
interface InstallationPaths { entrypoint?: string; executable?: string }
interface UpdateCommand { command: string; args: string[]; hint: string }

export function detectInstallMethod(paths: InstallationPaths = {}): InstallMethod {
  const candidates = [paths.entrypoint ?? process.argv[1], paths.executable ?? process.execPath]
    .filter((value): value is string => Boolean(value))
    .flatMap(value => {
      try { return [value, realpathSync(value)]; } catch { return [value]; }
    }).map(value => value.replaceAll('\\', '/'));
  if (candidates.some(value => /\/(?:Cellar|opt)\/autohand-code\//.test(value))) return 'brew';
  if (candidates.some(value => /\/\.bun\/install\/global\/node_modules\/autohand-cli\//.test(value))) return 'bun';
  if (candidates.some(value => /\/node_modules\/autohand-cli\//.test(value))) return 'npm';
  return 'standalone';
}

export function getUpdateCommand(
  channel: ReleaseChannel,
  installation: { method?: InstallMethod; platform?: NodeJS.Platform } = {},
): UpdateCommand {
  const method = installation.method ?? detectInstallMethod();
  if (method === 'npm' || method === 'bun') {
    const args = [method === 'npm' ? 'install' : 'add', '-g', `autohand-cli@${channel === 'alpha' ? 'alpha' : 'latest'}`];
    return { command: method, args, hint: [method, ...args].join(' ') };
  }
  if (method === 'brew') {
    return { command: 'brew', args: ['upgrade', 'autohandai/code/autohand-code'], hint: 'brew upgrade autohandai/code/autohand-code' };
  }
  if ((installation.platform ?? os.platform()) === 'win32') {
    const script = `& ([scriptblock]::Create((Invoke-RestMethod 'https://autohand.ai/install.ps1')))${channel === 'alpha' ? ' -Alpha' : ''}`;
    return {
      command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      hint: `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${script}"`,
    };
  }
  const hint = `curl -fsSL https://autohand.ai/install.sh | sh${channel === 'alpha' ? ' -s -- --alpha' : ''}`;
  return { command: 'sh', args: ['-c', hint], hint };
}
