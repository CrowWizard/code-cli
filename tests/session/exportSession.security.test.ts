import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { exportToHtml, exportToJson, exportToMarkdown } from '../../src/session/exportSession.js';
import { execute } from '../../src/commands/export.js';
import type { Session, SessionManager } from '../../src/session/SessionManager.js';
import type { SessionMessage, SessionMetadata } from '../../src/session/types.js';

const dialog = vi.hoisted(() => ({ format: 'md', filename: 'exported.md', exports: '' }));
vi.mock('../../src/ui/ink/components/Modal.js', () => ({
  showModal: vi.fn(async () => ({ value: dialog.format })),
  showInput: vi.fn(async () => dialog.filename),
  showConfirm: vi.fn(async () => true),
}));
vi.mock('../../src/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/constants.js')>();
  return { ...actual, AUTOHAND_PATHS: { ...actual.AUTOHAND_PATHS, get exports() { return dialog.exports; } } };
});

const key = 'sk-test1234567890abcdefghijklmnop';
const privateBody = 'PRIVATE_BODY_SHOULD_NEVER_LEAVE_THE_MACHINE';
const pem = ['-----BEGIN PRIVATE KEY-----', privateBody, '-----END PRIVATE KEY-----'].join('\n');
const metadata: SessionMetadata = {
  sessionId: 'session-export-test', createdAt: '2026-10-21T10:00:00Z',
  lastActiveAt: '2026-10-21T10:01:00Z', projectName: 'export project',
  projectPath: '/repo/export-project', model: 'fantail', messageCount: 2, status: 'active',
};
const messages: SessionMessage[] = [
  { role: 'user', content: 'Keep this useful context.', timestamp: metadata.createdAt },
  { role: 'tool', name: 'run_command', content: 'OPENAI_API_KEY=' + key + '\n' + pem, timestamp: metadata.lastActiveAt },
];

function context(workspaceRoot: string) {
  return {
    workspaceRoot,
    sessionManager: {} as SessionManager,
    currentSession: { metadata, getMessages: () => messages } as unknown as Session,
  };
}

describe('session export privacy (F-0154)', () => {
  let fixture: string;
  let workspace: string;
  beforeEach(async () => {
    fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'autohand-export-security-'));
    workspace = path.join(fixture, 'repo');
    dialog.exports = path.join(fixture, 'user', 'exports');
    await fs.ensureDir(workspace);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(async () => { vi.restoreAllMocks(); await fs.remove(fixture); });

  it.each([
    ['md', exportToMarkdown], ['html', exportToHtml], ['json', exportToJson],
  ] as const)('redacts tool outputs before producing %s', (format, render) => {
    const content = render(metadata, messages);
    expect(content).not.toContain(key);
    expect(content).not.toContain(privateBody);
    expect(content).not.toContain('BEGIN PRIVATE KEY');
    expect(content).toContain('[REDACTED]');
    expect(content).toContain('Keep this useful context.');
    if (format === 'json') expect(JSON.parse(content).messages[1].content).toContain('[REDACTED PRIVATE KEY]');
    expect(messages[1].content).toContain(key);
  });

  it('redacts metadata and nested tool arguments without corrupting JSON', () => {
    const nestedSecret = 'nested-credential-do-not-export';
    const input: SessionMessage[] = [{ role: 'assistant', content: 'Calling tool.', timestamp: metadata.createdAt,
      toolCalls: [{ function: { name: 'request', arguments: { apiKey: nestedSecret, url: 'https://example.invalid/?token=another-secret#section' } } }],
    }];
    const output = exportToJson({ ...metadata, summary: 'PASSWORD=summary-secret-value' }, input);
    const parsed = JSON.parse(output);
    expect(output).not.toContain(nestedSecret);
    expect(output).not.toContain('summary-secret-value');
    expect(output).not.toContain('another-secret');
    expect(parsed.messages[0].toolCalls[0].function.arguments.url).toContain('#section');
  });

  it.each(['md', 'html', 'json'])('saves the default %s outside the repository and reports a count', async (format) => {
    dialog.format = format; dialog.filename = 'exported.' + format;
    await execute(undefined, context(workspace));
    const destination = path.join(dialog.exports, dialog.filename);
    const content = await fs.readFile(destination, 'utf8');
    expect(content).not.toContain(key);
    expect(content).not.toContain(privateBody);
    expect(await fs.pathExists(path.join(workspace, dialog.filename))).toBe(false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Secrets redacted: 2'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(destination));
  });

  it.each(['absolute', 'explicit-relative'])('keeps an %s destination selected by the user', async (kind) => {
    dialog.format = 'json';
    const destination = path.join(workspace, 'chosen', 'session.json');
    dialog.filename = kind === 'absolute' ? destination : './chosen/session.json';
    await execute(undefined, context(workspace));
    expect(JSON.parse(await fs.readFile(destination, 'utf8')).messages).toHaveLength(2);
  });

  it('requires an explicit path before leaving the default export directory', async () => {
    dialog.format = 'md'; dialog.filename = '../outside.md';
    await execute(undefined, context(workspace));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('absolute or ./'));
    expect(await fs.pathExists(path.join(fixture, 'outside.md'))).toBe(false);
    expect(await fs.pathExists(path.join(fixture, 'user', 'outside.md'))).toBe(false);
  });
});
