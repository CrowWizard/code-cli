import { describe, expect, it } from 'vitest';
import { runCheckpointFooterScenario, runGoalCompletionScenario } from '../../src/testing/scenarios/checkpointFooterScenario.js';
import { GoalManager } from '../../src/goals/GoalManager.js';
import { createMockAutohandAINativeSequenceServer, createTempAutohandHome,
  exitInteractive, launchBuiltAutohand } from './helpers/autohandTuistory.js';

describe('checkpoint completion footer', () => {
  it.each([false, true])('persists goal completion only after delivered approval: %s', async (approved) => {
    const review = approved ? '{"verdict":"approved","feedback":"Evidence reviewed."}' : 'not json';
    const server = await createMockAutohandAINativeSequenceServer([
      { content: 'Creating approved goal.', toolCall: { id: 'create', name: 'create_goal', args: { objective: 'Deliver changelog' } } },
      { content: 'Queueing approved successor.', toolCall: { id: 'enqueue', name: 'enqueue_goal', args: { objective: 'Repair installer' } } },
      { content: 'Preparing completion.', toolCall: { id: 'complete', name: 'update_goal', args: { status: 'complete' } } },
      { content: 'DELIVERED_CHANGELOG: Repository facts verified.' },
      { content: review }, { content: review },
    ]);
    const state = await createTempAutohandHome({ config: {
      provider: 'autohandai',
      autohandai: { plan: 'cloud', authMode: 'api-key', apiKey: 'fixture', model: 'moa', orchestration: true, baseUrl: server.baseUrl },
      features: { slashGoal: true, autohand_inference: true, automaticSpecialists: false },
      agent: { goalAutoMode: false, autoMemory: false, maxIterations: 6, sessionRetryLimit: 0 },
      network: { maxRetries: 0, retryDelay: 0 },
      ui: { promptSuggestions: false, showCompletionNotification: false, terminalBell: false },
    } });
    let session: Awaited<ReturnType<typeof launchBuiltAutohand>> | undefined;
    try {
      session = await launchBuiltAutohand(['--path', state.workspaceRoot, '--config', state.configPath, '--yes'], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot, cols: 120, rows: 36,
      });
      const screen = await runGoalCompletionScenario(session);
      expect(screen).toContain(approved ? 'Completed in' : 'Failed in');
      if (approved) expect(screen).toContain('DELIVERED_CHANGELOG');
      await exitInteractive(session);
      const snapshot = await new GoalManager(state.workspaceRoot).getSnapshot();
      expect(snapshot.completed).toHaveLength(approved ? 1 : 0);
      expect(snapshot.queue).toHaveLength(approved ? 0 : 1);
      expect(Object.values(snapshot.goals)).toEqual([
        expect.objectContaining({ objective: approved ? 'Repair installer' : 'Deliver changelog', status: 'active' }),
      ]);
    } finally {
      session?.close(); await server.close(); await state.cleanup();
    }
  });

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
      if (footer === 'Failed in') {
        expect(screen).not.toContain('Completed in');
        expect(screen).toContain('Unreviewed draft');
        expect(screen).toContain('CHECKPOINT_FOOTER_ANSWER');
      }
      await exitInteractive(session);
    } finally {
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });
});
