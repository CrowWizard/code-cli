import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import type { Session } from 'tuistory';
import { requestStartupSafetyWrite, waitForNormalApprovalStartup } from '../../src/testing/scenarios/automodeStartupScenario.js';
import { createMockOpenRouterSequenceServer, createTempAutohandHome, exitInteractive, launchBuiltAutohand } from './helpers/autohandTuistory.js';

async function removePinnedStartupMode(configPath: string): Promise<void> {
  const config = await fs.readJson(configPath) as { ui?: { defaultInteractionMode?: string } };
  if (config.ui) delete config.ui.defaultInteractionMode;
  await fs.writeJson(configPath, config);
}

describe('interactive auto-mode startup safety', () => {
  it('ignores a legacy auto-mode file with a notice and starts with normal approvals', async () => {
    const state = await createTempAutohandHome();
    let session: Session | undefined;
    try {
      await removePinnedStartupMode(state.configPath);
      const legacy = path.join(state.workspaceRoot, '.autohand', 'automode.local.md');
      const contents = '# Auto-Mode State\n\n## Session\n- **Session ID:** stale-run\n- **Started:** 2026-10-19T00:00:00.000Z\n- **Prompt:** Old task\n\n## Progress\n- **Status:** running\n';
      await fs.outputFile(legacy, contents);
      session = await launchBuiltAutohand(['--path', state.workspaceRoot, '--config', state.configPath], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot,
      });
      const screen = await waitForNormalApprovalStartup(session);
      expect(screen).not.toContain('● AUTO');
      expect(session.readAll()).toContain('Ignored old auto-mode state');
      expect(await fs.readFile(legacy, 'utf8')).toBe(contents);
      await exitInteractive(session);
    } finally {
      if (session && !session.exitInfo) await exitInteractive(session);
      session?.close();
      await state.cleanup();
    }
  });

  it('requires approval before a model-requested write in an unconfigured terminal session', async () => {
    const server = await createMockOpenRouterSequenceServer([
      JSON.stringify({ toolCalls: [{ tool: 'shell', args: { command: 'touch startup-safety-result.txt' } }] }),
      JSON.stringify({ toolCalls: [], finalResponse: 'SAFETY_TURN_FINISHED' }),
    ]);
    const state = await createTempAutohandHome({ config: {
      openrouter: { baseUrl: server.baseUrl },
      agent: { autoMemory: false, maxIterations: 3, sessionRetryLimit: 0 },
      ui: { promptSuggestions: false, showCompletionNotification: false, terminalBell: false },
    } });
    let session: Session | undefined;
    try {
      await removePinnedStartupMode(state.configPath);
      session = await launchBuiltAutohand(['--path', state.workspaceRoot, '--config', state.configPath], {
        autohandHome: state.autohandHome, cwd: state.workspaceRoot,
      });
      const screen = await requestStartupSafetyWrite(session);
      expect(screen).toContain('Run this shell command');
      expect(await fs.pathExists(path.join(state.workspaceRoot, 'startup-safety-result.txt'))).toBe(false);
      await session.press('escape');
      await exitInteractive(session);
    } finally {
      if (session && !session.exitInfo) await exitInteractive(session);
      session?.close();
      await server.close();
      await state.cleanup();
    }
  });
});
