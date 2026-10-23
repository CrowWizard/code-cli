import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import type { Session } from 'tuistory';
import { createTempAutohandHome, launchBuiltAutohand, waitForExit } from './helpers/autohandTuistory.js';

describe('CI sign-in safety', () => {
  it('exits with sign-in instructions without opening a login flow', async () => {
    const state = await createTempAutohandHome();
    let session: Session | undefined;
    try {
      const config = await fs.readJson(state.configPath) as Record<string, unknown>;
      delete config.auth;
      await fs.writeJson(state.configPath, config);
      session = await launchBuiltAutohand(['--config', state.configPath, '--path', state.workspaceRoot, '-p', 'Hello'], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot, env: { CI: '1' },
      });
      await waitForExit(session, 5_000);
      expect(session.exitInfo?.exitCode).toBe(1);
      expect(session.readAll()).toContain('Not signed in.');
      expect(session.readAll()).toContain('autohand login');
      expect(session.readAll()).toContain('AUTOHAND_API_KEY');
      expect(session.readAll()).toContain('--bare');
      expect(session.readAll()).not.toContain('Sign in to continue.');
    } finally {
      session?.close();
      await state.cleanup();
    }
  });
});
