/** @license Apache-2.0 */
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import type { Session } from 'tuistory';
import { seedFullScreenHistory } from '../../src/testing/scenarios/fullScreenScenario.js';
import { outputViewport, LONG_OUTPUT_COMMAND, runLongOutputTurn } from '../../src/testing/scenarios/compactOutputScenario.js';
import { createMockAutohandAINativeSequenceServer, type MockNativeToolServer, createTempAutohandHome, launchBuiltAutohand, exitInteractive, type TuistoryTempState } from './helpers/autohandTuistory.js';
let server: MockNativeToolServer | undefined;
let state: TuistoryTempState | undefined;
let session: Session | undefined;
afterEach(async () => { session?.close(); await server?.close(); server = undefined; await state?.cleanup(); session = undefined; state = undefined; });

describe('experimental full-screen terminal', () => {
  it('pages, searches, resizes and returns from usage without losing the composer or history', async () => {
    state = await createTempAutohandHome({ config: { features: { fullScreenMode: true, cliUsageV2: true }, ui: { promptSuggestions: false, terminalBell: false, showCompletionNotification: false } } });
    await seedFullScreenHistory(state.autohandHome, state.workspaceRoot);
    session = await launchBuiltAutohand(['resume', 'full-screen-history', '--config', state.configPath, '--offline'], { autohandHome: state.autohandHome, cwd: state.workspaceRoot, waitForDataTimeout: 15_000, cols: 100, rows: 30 });
    await session.waitForText('History item 79', { timeout: 30_000 });
    const snapshot = await readFile(new URL('../../src/testing/snapshots/full-screen.txt', import.meta.url), 'utf8');
    for (const line of snapshot.trimEnd().split('\n')) expect(outputViewport(session)).toContain(line);
    await session.type('preserved draft'); await session.waitForText('❯ preserved draft');
    await session.press('pageup'); await session.waitForText('Ctrl+End latest');
    expect(outputViewport(session)).not.toContain('History item 79');
    await session.press(['ctrl', 'f']); await session.type('History item 20'); await session.press('enter');
    await session.waitForText('History item 20'); await session.press('esc');
    expect(outputViewport(session)).toContain('preserved draft');
    await session.resize({ cols: 60, rows: 20 }); await session.text();
    expect(outputViewport(session)).toContain('preserved draft');
    expect(outputViewport(session)).toContain('History item 20');
    await session.write('\x1b[1;5F'); await session.waitForText('History item 79');
    for (let i = 0; i < 'preserved draft'.length; i++) await session.press('backspace');
    await session.type('/usage'); await session.press('enter'); await session.waitForText('Activity overview');
    await session.press('esc'); await session.waitForText('Full screen');
    expect(outputViewport(session)).toContain('History item 79');
    await session.type('draft after modal'); await session.waitForText('❯ draft after modal');
    await exitInteractive(session);
  }, 90_000);

  it('keeps the composer usable while working and paging through expanded output', async () => {
    server = await createMockAutohandAINativeSequenceServer([
      { content: 'Listing rows.', toolCall: { id: 'full-screen-output', name: 'run_command', args: LONG_OUTPUT_COMMAND } },
      { content: 'FULL_SCREEN_DONE' },
    ]);
    state = await createTempAutohandHome({ config: {
      provider: 'autohandai',
      autohandai: { plan: 'cloud', authMode: 'api-key', apiKey: 'tuistory-test-key', model: 'moa', baseUrl: server.baseUrl },
      features: { fullScreenMode: true, autohand_inference: true },
      agent: { autoMemory: false, maxIterations: 4, sessionRetryLimit: 0 },
      network: { maxRetries: 0, retryDelay: 0 },
      ui: { promptSuggestions: false, showCompletionNotification: false, terminalBell: false },
    } });
    session = await launchBuiltAutohand(['--yes', '--config', state.configPath, '--path', state.workspaceRoot], {
      autohandHome: state.autohandHome, cwd: state.workspaceRoot, waitForDataTimeout: 15_000, cols: 80, rows: 24,
    });
    await runLongOutputTurn(session, 'FULL_SCREEN_DONE');
    expect(outputViewport(session)).toContain('❯');
    expect(outputViewport(session)).not.toContain('row-40');
    await session.press(['ctrl', 'o']); await session.waitForText('Ctrl+O collapse');
    expect(outputViewport(session)).toContain('row-1');
    await session.type('draft remains editable'); await session.waitForText('❯ draft remains editable');
    await session.press('pagedown'); await session.text();
    expect(outputViewport(session)).not.toContain('Ctrl+O collapse');
    expect(outputViewport(session)).toContain('draft remains editable');
    await session.write('\x1b[1;5F'); await session.waitForText('row-40');
    await session.press(['ctrl', 'o']); await session.waitForText('FULL_SCREEN_DONE');
    expect(outputViewport(session)).toContain('draft remains editable');
    expect(JSON.stringify(server.requests)).toContain('row-40');
    await exitInteractive(session);
  }, 90_000);

  it('persists explicit opt-in through experiments and leaves the current inline session unchanged', async () => {
    state = await createTempAutohandHome({ config: { ui: { promptSuggestions: false } } });
    session = await launchBuiltAutohand(['--config', state.configPath, '--offline'], { autohandHome: state.autohandHome, cwd: state.workspaceRoot, waitForDataTimeout: 15_000 });
    await session.waitForText('❯');
    expect(outputViewport(session)).not.toContain('Full screen');
    await session.type('/experiments enable full_screen_mode'); await session.press('enter');
    await session.waitForText('Restart');
    const config = JSON.parse(await readFile(state.configPath, 'utf8'));
    expect(config.features.fullScreenMode).toBe(true);
    expect(outputViewport(session)).not.toContain('Full screen ·');
    await exitInteractive(session);
  });
});
