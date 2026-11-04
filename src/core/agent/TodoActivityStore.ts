/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'fs-extra';
import path from 'node:path';

export interface StoredTodoActivity {
  id?: string;
  title?: string;
  content?: string;
  status?: string;
  activeForm?: string;
  [key: string]: unknown;
}

function sessionTodoPath(workspaceRoot: string, sessionId: string): string {
  return path.join(workspaceRoot, '.autohand', 'agents', 'tasks', `${encodeURIComponent(sessionId)}.json`);
}

export async function writeSessionTodoActivity(
  workspaceRoot: string,
  sessionId: string | undefined,
  todos: StoredTodoActivity[],
): Promise<void> {
  if (!sessionId) return;
  const filePath = sessionTodoPath(workspaceRoot, sessionId);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, todos, { spaces: 2 });
}

export async function readSessionTodoActivity(
  workspaceRoot: string,
  sessionId: string,
): Promise<StoredTodoActivity[]> {
  const sessionPath = sessionTodoPath(workspaceRoot, sessionId);
  try {
    const value: unknown = await fs.readJson(sessionPath);
    return Array.isArray(value) ? value.filter((item): item is StoredTodoActivity => Boolean(item) && typeof item === 'object') : [];
  } catch {
    try {
      const legacyPath = path.join(workspaceRoot, '.autohand', 'agents', 'tasks', 'todos.json');
      const legacyValue: unknown = await fs.readJson(legacyPath);
      const todos = Array.isArray(legacyValue)
        ? legacyValue.filter((item): item is StoredTodoActivity => Boolean(item) && typeof item === 'object')
        : [];
      if (todos.length > 0) await writeSessionTodoActivity(workspaceRoot, sessionId, todos);
      return todos;
    } catch {
      return [];
    }
  }
}