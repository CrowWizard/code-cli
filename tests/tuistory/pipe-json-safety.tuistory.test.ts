import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import type { Session } from 'tuistory';
import { createMockOpenRouterSequenceServer, createTempAutohandHome, launchBuiltAutohand, waitForExit } from './helpers/autohandTuistory.js';

describe('one-shot command input in real terminals', () => {
  it.skipIf(process.platform === 'win32')('finishes a real git diff pipe with stdout on a terminal', async () => {
    const server = await createMockOpenRouterSequenceServer([
      JSON.stringify({ toolCalls: [], finalResponse: 'PIPE_RESULT_FINISHED' }),
    ]);
    const state = await createTempAutohandHome({ config: {
      openrouter: { baseUrl: server.baseUrl }, agent: { autoMemory: false },
      ui: { showCompletionNotification: false },
    } });
    let session: Session | undefined;
    try {
      await fs.writeFile(path.join(state.workspaceRoot, 'example.txt'), 'before\n');
      execFileSync('git', ['add', 'example.txt'], { cwd: state.workspaceRoot });
      await fs.writeFile(path.join(state.workspaceRoot, 'example.txt'), 'after\n');
      session = await launchBuiltAutohand(['--config', state.configPath, '--path', state.workspaceRoot, 'explain these changes'], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot, inputCommand: ['git', 'diff'],
      });
      await waitForExit(session, 15_000);
      expect(session.exitInfo?.exitCode, session.readAll()).toBe(0);
      expect(session.readAll()).toContain('PIPE_RESULT_FINISHED');
      expect(JSON.stringify(server.requests)).toContain('-before');
      expect(JSON.stringify(server.requests)).toContain('+after');
      expect(JSON.stringify(server.requests)).toContain('explain these changes');
    } finally {
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });

  it('treats --json followed by prompt text as a JSON command', async () => {
    const server = await createMockOpenRouterSequenceServer([
      JSON.stringify({ toolCalls: [], finalResponse: 'JSON_PROMPT_FINISHED' }),
    ]);
    const state = await createTempAutohandHome({ config: { openrouter: { baseUrl: server.baseUrl }, agent: { autoMemory: false } } });
    let session: Session | undefined;
    try {
      session = await launchBuiltAutohand(['--config', state.configPath, '--path', state.workspaceRoot, '--json', 'list todos'], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot,
      });
      await waitForExit(session, 15_000);
      expect(session.exitInfo?.exitCode, session.readAll()).toBe(0);
      expect(session.readAll()).toContain('"type":"result","content":"JSON_PROMPT_FINISHED"');
      expect(JSON.stringify(server.requests)).toContain('list todos');
    } finally {
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });
});
