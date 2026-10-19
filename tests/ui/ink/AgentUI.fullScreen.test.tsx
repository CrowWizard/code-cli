import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import { AgentUI, createInitialUIState } from '../../../src/ui/ink/AgentUI.js';
import { FullScreenTranscript } from '../../../src/ui/ink/fullScreenTranscript.js';
import { ThemeProvider } from '../../../src/ui/theme/ThemeContext.js';
import { I18nProvider } from '../../../src/ui/i18n/index.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 40));
afterEach(cleanup);

describe('full-screen composer integration', () => {
  it('dismisses shortcuts before leaving history and leaves interruption available at the tail', async () => {
    const model = new FullScreenTranscript();
    const state = { ...createInitialUIState(), chatMessages: Array.from({ length: 100 }, (_, i) => ({ role: 'assistant' as const, content: `Message ${i}` })) };
    const onEscape = vi.fn();
    const view = render(<I18nProvider><ThemeProvider><AgentUI fullScreenTranscript={model} state={state} onInstruction={() => {}} onEscape={onEscape} onCtrlC={() => {}} /></ThemeProvider></I18nProvider>);
    await flush();
    view.stdin.write('\x1b[5~'); await flush();
    view.stdin.write('?'); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('Keyboard shortcuts');
    view.stdin.write('\x1b'); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).not.toContain('Keyboard shortcuts');
    expect(model.view(8).following).toBe(false);
    view.stdin.write('\x1b'); await flush();
    expect(model.view(8).following).toBe(true);
    expect(onEscape).not.toHaveBeenCalled();
    view.stdin.write('\x1b'); await flush();
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it('keeps drafts editable while paging and searching long history', async () => {
    const state = { ...createInitialUIState(), currentInput: 'preserved draft', chatMessages: Array.from({ length: 200 }, (_, index) => ({ role: 'assistant' as const, content: `History entry ${index}` })) };
    const model = new FullScreenTranscript();
    const view = render(<I18nProvider><ThemeProvider><AgentUI fullScreenTranscript={model} state={state} onInstruction={() => {}} onEscape={() => {}} onCtrlC={() => {}} /></ThemeProvider></I18nProvider>);
    await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('preserved draft');
    expect(stripAnsi(view.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(24);
    view.stdin.write('\x1b[5~'); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('Ctrl+End latest');
    view.stdin.write('\x06'); await flush();
    view.stdin.write('History entry 40'); await flush(); view.stdin.write('\r'); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('History entry 40');
    view.stdin.write('\x1b'); await flush();
    view.stdin.write(' added'); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('preserved draft added');
    view.stdin.write('\x1b[1;5F'); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('History entry 199');
    view.unmount();
  });
  it('keeps the composer visible with working status and a long queue', async () => {
    const state = { ...createInitialUIState(), currentInput: 'editable during work', isWorking: true, status: 'Running a long command', queuedInstructions: Array.from({ length: 40 }, (_, i) => `queued message ${i}`) };
    const view = render(<I18nProvider><ThemeProvider><AgentUI fullScreenTranscript={new FullScreenTranscript()} state={state} enableQueueInput onInstruction={() => {}} onEscape={() => {}} onCtrlC={() => {}} /></ThemeProvider></I18nProvider>);
    await flush();
    const screen = stripAnsi(view.lastFrame() ?? '');
    expect(screen).toContain('editable during work');
    expect(screen.split('\n').length).toBeLessThanOrEqual(24);
    view.unmount();
  });

  it('keeps the active end of a multiline draft visible', async () => {
    const draft = Array.from({ length: 50 }, (_, index) => `draft line ${index}`).join('\n');
    const state = { ...createInitialUIState(), currentInput: draft };
    const view = render(<I18nProvider><ThemeProvider><AgentUI fullScreenTranscript={new FullScreenTranscript()} state={state} onInstruction={() => {}} onEscape={() => {}} onCtrlC={() => {}} /></ThemeProvider></I18nProvider>);
    await flush();
    const screen = stripAnsi(view.lastFrame() ?? '');
    expect(screen).toContain('draft line 49');
    expect(screen).toContain('context left');
    expect(screen.split('\n').length).toBeLessThanOrEqual(24);
    view.unmount();
  });

});
