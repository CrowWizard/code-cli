import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import type { Session } from 'tuistory';
import { createMockAutohandAINativeSequenceServer, createTempAutohandHome, launchBuiltAutohand, waitForExit } from './helpers/autohandTuistory.js';

describe('per-run CLI model provider selection', () => {
  it.each([false, true])('routes Fantail from an Ollama default without saving it (auto mode: %s)', async autoMode => {
    const server = await createMockAutohandAINativeSequenceServer([{ content: autoMode ? '<promise>DONE</promise>' : 'HOSTED_SELECTION_FINISHED' }]);
    const state = await createTempAutohandHome({ config: {
      provider: 'ollama', ollama: { model: 'local-fixture' },
      autohandai: { plan: 'cloud', authMode: 'api-key', apiKey: 'fixture', model: 'moa', baseUrl: server.baseUrl },
      features: { autohand_inference: true }, agent: { autoMemory: false },
      ui: { terminalBell: false, showCompletionNotification: false },
    } });
    let session: Session | undefined;
    try {
      const original = await fs.readJson(state.configPath);
      session = await launchBuiltAutohand([
        '--config', state.configPath, '--path', state.workspaceRoot, '--model', 'fantail',
        ...(autoMode ? ['--auto-mode', 'Confirm this fixture is complete', '--no-worktree', '--max-iterations', '2'] : ['-p', 'Confirm provider selection']),
      ], { autohandHome: state.autohandHome, cwd: state.workspaceRoot });
      await waitForExit(session, 20_000);
      expect(session.exitInfo?.exitCode, session.readAll()).toBe(0);
      expect(server.requests.length).toBeGreaterThan(0);
      expect(server.requests[0].model).toBe('fantail');
      const saved = await fs.readJson(state.configPath);
      expect(saved.provider).toBe('ollama');
      expect(saved.ollama).toEqual(original.ollama);
      expect(saved.autohandai).toEqual(original.autohandai);
    } finally {
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });
});
