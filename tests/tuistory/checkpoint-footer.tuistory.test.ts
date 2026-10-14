import { describe, expect, it } from 'vitest';
import { runCheckpointFooterScenario } from '../../src/testing/scenarios/checkpointFooterScenario.js';
import { createMockAutohandAINativeSequenceServer, createTempAutohandHome,
  exitInteractive, launchBuiltAutohand } from './helpers/autohandTuistory.js';

describe('checkpoint completion footer', () => {
  it.each([
    { name: 'unavailable review', review: 'not json', footer: 'Failed in' },
    { name: 'approved review', review: '{"verdict":"approved","feedback":"Source evidence checked."}', footer: 'Completed in' },
  ])('shows an honest outcome after $name', async ({ review, footer }) => {
    const server = await createMockAutohandAINativeSequenceServer([
      { content: 'Reading package.json.', toolCall: { id: 'read-package', name: 'read_file', args: { path: 'package.json' } } },
      { content: 'CHECKPOINT_FOOTER_ANSWER: Repository facts verified.' },
      { content: review },
      { content: review },
    ]);
    const state = await createTempAutohandHome({ config: {
      provider: 'autohandai',
      autohandai: { plan: 'cloud', authMode: 'api-key', apiKey: 'fixture', model: 'moa', orchestration: true, baseUrl: server.baseUrl },
      features: { autohand_inference: true, automaticSpecialists: false },
      agent: { autoMemory: false, maxIterations: 5, sessionRetryLimit: 0 },
      network: { maxRetries: 0, retryDelay: 0 },
      ui: { promptSuggestions: false, showCompletionNotification: false, terminalBell: false },
    } });
    let session: Awaited<ReturnType<typeof launchBuiltAutohand>> | undefined;
    try {
      session = await launchBuiltAutohand(['--path', state.workspaceRoot, '--config', state.configPath, '--yes'], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot, cols: 120, rows: 36, waitForDataTimeout: 15_000,
      });
      const screen = await runCheckpointFooterScenario(session);
      expect(screen).toContain(footer);
      if (footer === 'Failed in') expect(screen).not.toContain('Completed in');
      await exitInteractive(session);
    } finally {
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });
});
