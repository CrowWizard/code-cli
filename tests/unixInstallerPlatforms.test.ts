import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const installer = await fs.readFile(new URL('../install.sh', import.meta.url), 'utf8');
const functions = installer.replace(/\nmain "\$@" \|\| exit 1\s*$/, '');
const alpineHost = await fs.pathExists('/etc/alpine-release');

describe.skipIf(process.platform === 'win32')('Unix installer platform compatibility', () => {
  async function run(system: string, libc: string, fullInstall = false) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'installer-platform-'));
    try {
      const bin = path.join(root, 'bin');
      await fs.ensureDir(bin);
      const commands = {
        uname: `case "$1" in -s) printf '%s\\n' '${system}' ;; -m) printf 'x86_64\\n' ;; esac`,
        ldd: `printf '%s\\n' '${libc}' >&2`,
        curl: 'exit 22',
      };
      for (const [name, body] of Object.entries(commands)) {
        await fs.writeFile(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      }
      const script = path.join(root, 'probe.sh');
      await fs.writeFile(script, fullInstall ? installer : `${functions}\nget_architecture\nprintf '%s\\n' "$RETVAL"\n`);
      return spawnSync('/bin/sh', [script], {
        encoding: 'utf8', timeout: 5_000,
        env: { ...process.env, PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, AUTOHAND_VERSION: '0.9.8',
          AUTOHAND_INSTALL_DIR: path.join(root, 'install'), AUTOHAND_INSTALL_FIRST_RUN: 'no', AUTOHAND_SKIP_ZIT_INSTALL: '1' },
      });
    } finally {
      await fs.remove(root);
    }
  }

  it('selects a musl-specific Linux asset', async () => {
    const result = await run('Linux', 'musl libc 1.2.5');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('linux-x64-musl');
  });

  it.skipIf(alpineHost)('keeps glibc Linux on its existing asset', async () => {
    const result = await run('Linux', 'ldd (GNU libc) 2.39');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('linux-x64');
  });

  it('gives an actionable npm fallback when a musl asset is unavailable', async () => {
    const result = await run('Linux', 'musl libc 1.2.5', true);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('npm i -g autohand-cli (Node 22+)');
    expect(result.stdout + result.stderr).toContain('Alpine/musl');
  });

  it('rejects FreeBSD instead of downloading a Linux binary', async () => {
    const result = await run('FreeBSD', '');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('FreeBSD');
    expect(result.stderr).toContain('npm i -g autohand-cli');
  });
});
