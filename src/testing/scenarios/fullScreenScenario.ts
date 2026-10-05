/** @license Apache-2.0 */
import path from 'node:path';
import type { Session as TerminalSession } from 'tuistory';
import { mkdir, writeFile } from 'node:fs/promises';
import { Session } from '../../session/SessionManager.js';

export async function seedFullScreenHistory(home: string, project: string): Promise<void> {
  const date = new Date().toISOString();
  const metadata = { sessionId: 'full-screen-history', createdAt: date, lastActiveAt: date, projectPath: project,
    projectName: 'workspace', model: 'moa', messageCount: 80, status: 'completed' as const };
  await mkdir(path.join(home, 'sessions', metadata.sessionId), { recursive: true });
  const session = new Session(path.join(home, 'sessions', metadata.sessionId), metadata);
  for (let index = 0; index < 80; index++) await session.appendTransient({ role: 'assistant', content: `History item ${index} — preserved transcript`, timestamp: date });
  await session.save();
  await writeFile(path.join(home, 'sessions', metadata.sessionId, 'metadata.json'), JSON.stringify(metadata));
  await writeFile(path.join(home, 'sessions', 'index.json'), JSON.stringify({ sessions: [{ id: metadata.sessionId, projectPath: project, createdAt: date }], byProject: { [project]: [metadata.sessionId] } }));
}

export async function clickFullScreenComposer(session: TerminalSession, column: number, row: number): Promise<void> {
  await session.clickAt(column, row);
  const [cursorColumn, cursorRow] = session.getTerminalData().cursor;
  session.writeRaw(`\x1b[${cursorRow + 1};${cursorColumn + 1}R`);
  await session.waitIdle();
}

export async function typeMultilineDraft(session: TerminalSession, lines: readonly string[]): Promise<void> {
  for (let index = 0; index < lines.length; index++) {
    await session.type(lines[index]!);
    if (index < lines.length - 1) {
      session.writeRaw('\n');
      await session.waitIdle();
    }
  }
}
