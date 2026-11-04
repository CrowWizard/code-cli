import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSessionTodoActivity, writeSessionTodoActivity } from '../../../src/core/agent/TodoActivityStore.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('TodoActivityStore', () => {
  it('persists task lists independently for each session', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autohand-todos-'));
    roots.push(workspaceRoot);
    const firstSessionTodos = [{ id: 'one', content: 'First session task', status: 'pending' }];
    const secondSessionTodos = [{ id: 'two', content: 'Second session task', status: 'in_progress' }];

    await writeSessionTodoActivity(workspaceRoot, 'session/one', firstSessionTodos);
    await writeSessionTodoActivity(workspaceRoot, 'session-two', secondSessionTodos);

    await expect(readSessionTodoActivity(workspaceRoot, 'session/one')).resolves.toEqual(firstSessionTodos);
    await expect(readSessionTodoActivity(workspaceRoot, 'session-two')).resolves.toEqual(secondSessionTodos);
    await expect(readSessionTodoActivity(workspaceRoot, 'missing')).resolves.toEqual([]);
  });

  it('migrates the legacy shared task list on first session restore', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autohand-todos-'));
    roots.push(workspaceRoot);
    const legacyTodos = [{ id: 'legacy', content: 'Unfinished legacy task', status: 'in_progress' }];
    const legacyPath = path.join(workspaceRoot, '.autohand', 'agents', 'tasks', 'todos.json');
    await fs.ensureDir(path.dirname(legacyPath));
    await fs.writeJson(legacyPath, legacyTodos);

    await expect(readSessionTodoActivity(workspaceRoot, 'previous-session')).resolves.toEqual(legacyTodos);
    await expect(readSessionTodoActivity(workspaceRoot, 'previous-session')).resolves.toEqual(legacyTodos);
  });
});