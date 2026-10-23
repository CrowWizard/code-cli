import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreAgentSessionState, type AgentLifecycleHost } from '../../src/core/agent/AgentLifecycleRunner.js';
import { FileActionManager, FILE_LIMITS } from '../../src/actions/filesystem.js';
import { ConversationManager } from '../../src/core/conversationManager.js';
import { undo, type UndoCommandContext } from '../../src/commands/undo.js';

describe('turn-wide /undo (F-0152)', () => {
  let root: string;
  let files: FileActionManager;
  let conversation: ConversationManager;
  let context: UndoCommandContext;
  const output = () => vi.mocked(console.log).mock.calls.flat().join('\n');
  const beginTurn = (text: string) => conversation.addMessage({ role: 'user', content: text });
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'autohand-turn-undo-'));
    conversation = new ConversationManager();
    conversation.reset('system');
    files = new FileActionManager(root);
    files.setTurnProvider(() => conversation.getLastTurn());
    context = {
      getLastTurn: () => conversation.getLastTurn(),
      undoTurnMutations: turn => files.undoTurn(turn),
      removeLastTurn: turnId => conversation.removeLastTurn(turnId),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });
  it('restores three files newest first and preserves the previous turn', async () => {
    beginTurn('previous');
    await files.writeFile('previous.ts', 'keep');
    for (const name of ['a.ts', 'b.ts', 'c.ts']) await fs.writeFile(path.join(root, name), 'before');
    beginTurn('three edits');
    for (const name of ['a.ts', 'b.ts', 'c.ts']) await files.writeFile(name, 'after');
    conversation.addMessage({ role: 'assistant', content: 'done' });
    await undo(context);
    for (const name of ['a.ts', 'b.ts', 'c.ts']) expect(await fs.readFile(path.join(root, name), 'utf8')).toBe('before');
    expect(await fs.readFile(path.join(root, 'previous.ts'), 'utf8')).toBe('keep');
    expect(conversation.history().map(message => message.content)).toEqual(['system', 'previous']);
    expect(output()).toContain('Restored 3 files: c.ts, b.ts, a.ts');
  });
  it('undoes two turns independently including repeated edits to one file', async () => {
    await fs.writeFile(path.join(root, 'same.ts'), 'zero');
    beginTurn('first');
    await files.writeFile('same.ts', 'one');
    beginTurn('second');
    await files.writeFile('same.ts', 'two');
    await files.writeFile('same.ts', 'three');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'same.ts'), 'utf8')).toBe('one');
    expect(output()).toContain('Restored 1 files: same.ts');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'same.ts'), 'utf8')).toBe('zero');
    expect(conversation.history()).toHaveLength(1);
  });
  it('stops at the first unsafe file, keeps history, and can retry remaining edits', async () => {
    beginTurn('edit three');
    for (const name of ['a.ts', 'b.ts', 'c.ts']) await files.writeFile(name, 'agent');
    const before = conversation.history();
    await fs.writeFile(path.join(root, 'b.ts'), 'user');
    await undo(context);
    expect(conversation.history()).toEqual(before);
    expect(await fs.readFile(path.join(root, 'a.ts'), 'utf8')).toBe('agent');
    expect(await fs.readFile(path.join(root, 'b.ts'), 'utf8')).toBe('user');
    await expect(fs.stat(path.join(root, 'c.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(output()).toContain('b.ts');
    expect(output()).toContain('changed after the agent mutation');
    expect(output()).toContain('Kept the last conversation turn');
    await fs.writeFile(path.join(root, 'b.ts'), 'agent');
    await undo(context);
    expect(conversation.history()).toHaveLength(1);
    await expect(fs.stat(path.join(root, 'a.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('deletes created files and restores deleted files, including binary contents', async () => {
    const binary = Buffer.from([0, 255, 254, 129, 3]);
    await fs.writeFile(path.join(root, 'deleted.bin'), binary);
    beginTurn('create and delete');
    await files.writeFile('created.ts', 'created');
    await files.deletePath('deleted.bin');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'deleted.bin'))).toEqual(binary);
    await expect(fs.stat(path.join(root, 'created.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(conversation.history()).toHaveLength(1);
  });
  it('does not take an older mutation for a turn with no file edits', async () => {
    beginTurn('older');
    await files.writeFile('older.ts', 'keep');
    beginTurn('discussion');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'older.ts'), 'utf8')).toBe('keep');
    expect(conversation.history().at(-1)?.content).toBe('older');
    expect(output()).toContain('No file changes in the last turn; removed it from the conversation.');
  });
  it('reports shell side effects and does not undo them', async () => {
    beginTurn('shell');
    files.markShellCommand();
    await fs.writeFile(path.join(root, 'shell.txt'), 'shell output');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'shell.txt'), 'utf8')).toBe('shell output');
    expect(output()).toContain('Shell command changes are not undone.');
  });
  it('keeps the turn if its undo journal was truncated', async () => {
    beginTurn('many edits');
    for (let index = 0; index < 102; index++) await files.writeFile('many.ts', String(index));
    const history = conversation.history();
    await undo(context);
    expect(conversation.history()).toEqual(history);
    expect(output()).toContain('undo history');
  });
  it('records accepted preview edits in their originating turn', async () => {
    beginTurn('preview');
    files.enterPreviewMode('turn-test');
    await files.writeFile('preview.ts', 'preview');
    await files.applyPendingChanges();
    await undo(context);
    await expect(fs.stat(path.join(root, 'preview.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('restores rename and copy file mutations including overwritten destinations', async () => {
    for (const [name, value] of [['source.txt', 'source'], ['destination.txt', 'previous']]) await fs.writeFile(path.join(root, name), value);
    beginTurn('rename and copy');
    await files.renamePath('source.txt', 'destination.txt');
    await files.copyPath('destination.txt', 'copied.txt');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'source.txt'), 'utf8')).toBe('source');
    expect(await fs.readFile(path.join(root, 'destination.txt'), 'utf8')).toBe('previous');
    await expect(fs.stat(path.join(root, 'copied.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('keeps a restored turn when its file journal is unavailable', async () => {
    const session = {
      getMessages: () => [{ role: 'user', content: 'previous file edit', timestamp: new Date().toISOString() }, { role: 'assistant', content: 'done', timestamp: new Date().toISOString() }],
    };
    await restoreAgentSessionState({
      runtime: { workspaceRoot: root },
      sessionManager: { loadSession: async () => session },
      resetConversationContext: async () => conversation.reset('system'),
      injectSessionBootstrap: async () => {}, injectProjectKnowledge: async () => {},
      conversation, updateContextUsage: () => {},
    } as unknown as AgentLifecycleHost, 'restored-session');
    await undo(context);
    expect(conversation.history()).toHaveLength(3);
    expect(output()).toContain('restored');
    expect(output()).toContain('Kept the last conversation turn');
  });

  it('restores exact bytes when a text write overwrote a binary file', async () => {
    const before = Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x01]);
    await fs.writeFile(path.join(root, 'original.bin'), before);
    beginTurn('overwrite binary');
    await files.writeFile('original.bin', 'replacement');
    await undo(context);
    expect(await fs.readFile(path.join(root, 'original.bin'))).toEqual(before);
  });
  it.skipIf(process.platform === 'win32')('restores executable permissions when undoing a file deletion', async () => {
    await fs.writeFile(path.join(root, 'script.sh'), '#!/bin/sh\n', { mode: 0o755 });
    beginTurn('delete executable');
    await files.deletePath('script.sh');
    await undo(context);
    expect((await fs.stat(path.join(root, 'script.sh'))).mode & 0o777).toBe(0o755);
  });

  it('removes a file created by apply_patch', async () => {
    beginTurn('create by patch');
    await files.applyPatch('added.txt', '--- /dev/null\n+++ b/added.txt\n@@ -0,0 +1 @@\n+created');
    await undo(context);
    await expect(fs.stat(path.join(root, 'added.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the turn when the undo byte budget cannot retain every original', async () => {
    const limits = FILE_LIMITS as typeof FILE_LIMITS & { MAX_UNDO_BYTES?: number };
    const originalLimit = limits.MAX_UNDO_BYTES;
    limits.MAX_UNDO_BYTES = 16;
    try {
      beginTurn('large journal');
      await files.writeFile('large.txt', 'x'.repeat(32));
      await undo(context);
      expect(conversation.history()).toHaveLength(2);
      expect(await fs.readFile(path.join(root, 'large.txt'), 'utf8')).toHaveLength(32);
      expect(output()).toContain('undo');
    } finally { limits.MAX_UNDO_BYTES = originalLimit; }
  });

  it.skipIf(process.platform === 'win32')('keeps user permission changes made after an agent write', async () => {
    await fs.writeFile(path.join(root, 'permissions.txt'), 'before', { mode: 0o644 });
    beginTurn('edit contents');
    await files.writeFile('permissions.txt', 'agent');
    await fs.chmod(path.join(root, 'permissions.txt'), 0o755);
    await undo(context);
    expect(conversation.history()).toHaveLength(2);
    expect(await fs.readFile(path.join(root, 'permissions.txt'), 'utf8')).toBe('agent');
    expect((await fs.stat(path.join(root, 'permissions.txt'))).mode & 0o777).toBe(0o755);
  });

});
