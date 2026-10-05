/** @license Apache-2.0 */
import path from 'node:path';
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
