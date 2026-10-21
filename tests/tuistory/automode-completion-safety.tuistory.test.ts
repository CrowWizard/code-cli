import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'fs-extra';
import type { Session } from 'tuistory';
import { createMockOpenRouterSequenceServer, createTempAutohandHome, launchBuiltAutohand, waitForExit } from './helpers/autohandTuistory.js';

describe('auto-mode command safety in a terminal', () => {
  it('stops on completion and leaves its branch available for review', async () => {
    const server = await createMockOpenRouterSequenceServer([
      JSON.stringify({ toolCalls: [], finalResponse: '<promise>DONE</promise>' }),
    ]);
    const state = await createTempAutohandHome({ config: {
      openrouter: { baseUrl: server.baseUrl },
      agent: { autoMemory: false, maxIterations: 2, sessionRetryLimit: 0 },
      ui: { promptSuggestions: false, showCompletionNotification: false, terminalBell: false },
    } });
    const git = (...args: string[]) => execFileSync('git', args, {
      cwd: state.workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const canonicalWorkspace = await fs.realpath(state.workspaceRoot);
    let session: Session | undefined;
    try {
      git('config', 'user.name', 'Terminal fixture');
      git('config', 'user.email', 'fixture@example.com');
      git('config', 'commit.gpgsign', 'false');
      git('config', 'core.hooksPath', '/dev/null');
      git('add', '.');
      git('commit', '-m', 'Initial fixture');
      const originalHead = git('rev-parse', 'HEAD');
      session = await launchBuiltAutohand([
        '--path', state.workspaceRoot, '--config', state.configPath,
        '--auto-mode', 'Confirm this fixture is complete.', '--max-iterations', '2',
      ], { autohandHome: state.autohandHome, cwd: state.workspaceRoot, rows: 50 });
      await waitForExit(session, 30_000);
      const output = session.readAll();
      expect(session.exitInfo?.exitCode, output).toBe(0);
      expect(output).toContain('completed after 1 iterations');
      expect(output).toContain('Merge: git');
      expect(output).toContain('Cleanup worktree: git');
      expect(git('rev-parse', 'HEAD')).toBe(originalHead);
      const localMetadata = await fs.pathExists(`${state.workspaceRoot}/.autohand`)
        ? await fs.readdir(`${state.workspaceRoot}/.autohand`, { recursive: true }) : [];
      expect(git('status', '--porcelain'), JSON.stringify(localMetadata)).toBe('');
      const trees = git('worktree', 'list', '--porcelain');
      expect(trees).toContain('refs/heads/autohand-automode-');
      for (const line of trees.split('\n')) {
        if (line.startsWith('worktree ') && line.slice(9) !== canonicalWorkspace) {
          expect(await fs.pathExists(line.slice(9))).toBe(true);
        }
      }
    } finally {
      session?.close();
      for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
        if (line.startsWith('worktree ') && line.slice(9) !== canonicalWorkspace) {
          git('worktree', 'remove', '--force', line.slice(9));
        }
      }
      await server.close();
      await state.cleanup();
    }
  });

  it('does not advertise an unenforced dollar cap', async () => {
    const session = await launchBuiltAutohand(['--help'], { rows: 100 });
    try {
      await waitForExit(session);
      expect(session.exitInfo?.exitCode).toBe(0);
      expect(session.readAll()).not.toContain('--max-cost');
      expect(session.readAll()).toContain('--max-iterations');
    } finally {
      session.close();
    }
  });
});
