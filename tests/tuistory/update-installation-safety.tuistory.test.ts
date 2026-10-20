import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import type { Session } from 'tuistory';
import { writeUpdateFetchFixture } from '../../src/testing/scenarios/updateScenario.js';
import { createTempAutohandHome, launchBuiltAutohand, repoRoot, waitForExit } from './helpers/autohandTuistory.js';

describe.skipIf(process.platform === 'win32')('update command installation method', () => {
  it.each([true, false])('keeps an npm installation on npm (check only: %s)', async check => {
    const state = await createTempAutohandHome();
    let session: Session | undefined;
    try {
      const packageRoot = path.join(state.autohandHome, 'node_modules/autohand-cli');
      await fs.ensureDir(packageRoot);
      await fs.symlink(path.join(repoRoot(), 'dist'), path.join(packageRoot, 'dist'));
      const bin = path.join(state.autohandHome, 'bin');
      await fs.ensureDir(bin);
      const invocation = path.join(state.autohandHome, 'npm-invocation.txt');
      await fs.writeFile(path.join(bin, 'npm'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$AUTOHAND_TEST_UPDATE_INVOCATION"\n', { mode: 0o755 });
      const preload = await writeUpdateFetchFixture(state.autohandHome);
      session = await launchBuiltAutohand(['update', ...(check ? ['--check'] : [])], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot,
        entrypoint: path.join(packageRoot, 'dist/index.js'),
        env: { NODE_OPTIONS: `--import=${preload}`, PATH: `${bin}:${process.env.PATH}`, AUTOHAND_TEST_UPDATE_INVOCATION: invocation },
      });
      await waitForExit(session, 10_000);
      expect(session.exitInfo?.exitCode, session.readAll()).toBe(check ? 1 : 0);
      expect(session.readAll()).toContain('npm install -g autohand-cli@latest');
      if (check) expect(await fs.pathExists(invocation)).toBe(false);
      else expect(await fs.readFile(invocation, 'utf8')).toBe('install\n-g\nautohand-cli@latest\n');
      expect(session.readAll()).not.toContain('curl -fsSL');
    } finally {
      session?.close();
      await state.cleanup();
    }
  });
});
