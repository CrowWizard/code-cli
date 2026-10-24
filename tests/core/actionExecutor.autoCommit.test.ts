import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionExecutor } from '../../src/core/actionExecutor.js';
import { FileActionManager } from '../../src/actions/filesystem.js';
import { captureAutoCommitSnapshot } from '../../src/actions/gitSessionSnapshot.js';
import type { AgentRuntime } from '../../src/types.js';

let root: string;
let runtime: AgentRuntime;
let executor: ActionExecutor;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd();
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'autohand-scoped-tools-'));
  git('init', '-q'); git('config', 'user.name', 'Autohand Tests'); git('config', 'user.email', 'tests@autohand.ai');
  fs.writeFileSync(path.join(root, 'README.md'), 'original\n'); git('add', '.'); git('commit', '-qm', 'fixture');
  fs.writeFileSync(path.join(root, 'README.md'), 'user staged\n'); git('add', 'README.md');
  runtime = { config: {}, workspaceRoot: root, options: { yes: true }, sessionGitSnapshot: captureAutoCommitSnapshot(root), autoCommitPaths: ['feature.ts'] } as AgentRuntime;
  fs.writeFileSync(path.join(root, 'feature.ts'), 'session\n');
  executor = new ActionExecutor({ runtime, files: new FileActionManager(root), resolveWorkspacePath: file => path.resolve(root, file), confirmDangerousAction: async () => true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('automatic commit tool boundaries', () => {
  it('rejects whole-repository git_add without changing user staging', async () => {
    await expect(executor.execute({ type: 'git_add', paths: ['.'] }, { approvalHandled: true })).rejects.toThrow('exact literal paths');
    expect(git('diff', '--cached', '--name-only')).toBe('README.md');
  });
  it('uses the private index for git_commit after exact staging', async () => {
    await executor.execute({ type: 'git_add', paths: ['feature.ts'] }, { approvalHandled: true });
    const result = await executor.execute({ type: 'git_commit', message: 'Add session feature' }, { approvalHandled: true });
    expect(result).toContain('Committed');
    expect(git('show', '--pretty=', '--name-only', 'HEAD')).toBe('feature.ts');
    expect(git('diff', '--cached', '--name-only')).toBe('README.md');
  });
  it('rejects destructive Git tools within the automatic commit phase', async () => {
    const result = await executor.execute({ type: 'git_reset', mode: 'mixed' }, { approvalHandled: true });
    expect(result).toContain('Automatic commit');
    expect(git('diff', '--cached', '--name-only')).toBe('README.md');
  });
});
