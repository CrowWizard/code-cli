import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { AutomodeState } from '../src/core/AutomodeState.js';

describe('auto-mode run state isolation', () => {
  let root: string;
  let workspace: string;
  let privateState: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'automode-state-isolation-'));
    workspace = path.join(root, 'workspace');
    privateState = path.join(root, 'private-state');
    await fs.ensureDir(workspace);
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  const options = (sessionId: string) => ({
    sessionId,
    prompt: 'Run the project checks',
    maxIterations: 3,
    completionPromise: 'DONE',
  });

  it('persists its run outside the project instead of producing a committable state file', async () => {
    const state = new AutomodeState(workspace, privateState);
    await state.initialize(options('run-one'));
    const saved = state.getStatePath();
    expect(path.relative(privateState, saved).startsWith('..')).toBe(false);
    expect(path.relative(workspace, saved).startsWith('..')).toBe(true);
    expect(await fs.pathExists(path.join(workspace, '.autohand', 'automode.local.md'))).toBe(false);
    expect(await fs.readFile(saved, 'utf8')).toContain('run-one');
  });

  it('uses distinct files for independent runs in the same project', async () => {
    const first = new AutomodeState(workspace, privateState);
    const second = new AutomodeState(workspace, privateState);
    await first.initialize(options('run-one'));
    await second.initialize(options('run-two'));
    expect(first.getStatePath()).not.toBe(second.getStatePath());
    expect(await fs.readFile(first.getStatePath(), 'utf8')).toContain('run-one');
    expect(await fs.readFile(second.getStatePath(), 'utf8')).toContain('run-two');
  });

  it('ignores and preserves a legacy project state file', async () => {
    const legacy = path.join(workspace, '.autohand', 'automode.local.md');
    const contents = '# Auto-Mode State\n\n## Session\n- **Session ID:** stale-run\n- **Started:** 2026-10-19T00:00:00.000Z\n- **Prompt:** Old task\n\n## Progress\n- **Current Iteration:** 1\n- **Max Iterations:** 10\n- **Status:** running\n';
    await fs.outputFile(legacy, contents);
    const state = new AutomodeState(workspace, privateState);
    expect(await state.hasActiveSession()).toBe(false);
    expect(await state.load()).toBeNull();
    expect(await fs.readFile(legacy, 'utf8')).toBe(contents);
  });

  it('keeps recovery scoped to the current run and gives a later run a fresh file', async () => {
    const state = new AutomodeState(workspace, privateState);
    await state.initialize(options('run-one'));
    const firstPath = state.getStatePath();
    expect(await state.hasActiveSession()).toBe(true);
    expect((await state.load())?.sessionId).toBe('run-one');
    await state.setStatus('cancelled', 'user_escape');
    await state.initialize(options('run-two'));
    expect(state.getStatePath()).not.toBe(firstPath);
    expect((await state.load())?.sessionId).toBe('run-two');
    expect(await fs.readFile(firstPath, 'utf8')).toContain('run-one');
  });

  it.runIf(process.platform !== 'win32')('restricts the persisted prompt and progress to the current user', async () => {
    const state = new AutomodeState(workspace, privateState);
    await state.initialize(options('private-run'));
    const metadata = await fs.stat(state.getStatePath());
    expect(metadata.mode & 0o777).toBe(0o600);
  });
});
