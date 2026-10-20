import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import type { Session } from 'tuistory';
import { createMockAutohandAINativeSequenceServer, createTempAutohandHome, launchBuiltAutohand, waitForExit } from './helpers/autohandTuistory.js';

describe('restricted review inspection', () => {
  it('reads evidence and returns a verdict without requiring an interactive approval', async () => {
    const server = await createMockAutohandAINativeSequenceServer([
      { content: 'Inspecting the changed implementation.', toolCall: { id: 'review-read', name: 'read_file', args: { path: 'example.ts' } } },
      { content: 'Verdict: approve. REVIEW_INSPECTION_FINISHED' },
    ]);
    const state = await createTempAutohandHome({ config: {
      provider: 'autohandai',
      autohandai: { plan: 'cloud', authMode: 'api-key', apiKey: 'fixture', model: 'fantail', baseUrl: server.baseUrl },
      features: { autohand_inference: true, automaticSpecialists: true }, agent: { autoMemory: false, sessionRetryLimit: 0 },
      ui: { terminalBell: false, showCompletionNotification: false },
    } });
    let session: Session | undefined;
    try {
      await fs.writeFile(path.join(state.workspaceRoot, 'example.ts'), 'export const REVIEW_FIXTURE_EVIDENCE = 42;\n');
      session = await launchBuiltAutohand(['--config', state.configPath, '--path', state.workspaceRoot, '--restricted', 'review', 'changes'], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot,
        ...(process.platform !== 'win32' ? { inputCommand: ['printf', ''] } : {}),
      });
      await waitForExit(session, 20_000);
      expect(session.exitInfo?.exitCode, session.readAll()).toBe(0);
      expect(session.readAll()).toContain('Verdict: approve.');
      const evidenceMessages = server.requests.flatMap(request =>
        (request.messages as Array<{ role: string; content?: unknown }>).filter(message => message.role !== 'system'));
      expect(JSON.stringify(evidenceMessages)).toContain('REVIEW_FIXTURE_EVIDENCE');
      expect(session.readAll()).not.toContain('denied by the permission policy');
      expect(session.readAll()).not.toContain('Sub-agent');
      expect(server.requests).toHaveLength(2);
      expect(await fs.readFile(path.join(state.workspaceRoot, 'example.ts'), 'utf8')).toBe('export const REVIEW_FIXTURE_EVIDENCE = 42;\n');
    } finally {
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });
});
