import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from 'ink-testing-library';
import { Text } from 'ink';
import stripAnsi from 'strip-ansi';
import { FullScreenFrame } from '../../../src/ui/ink/FullScreenFrame.js';
import { FullScreenTranscript } from '../../../src/ui/ink/fullScreenTranscript.js';
import { ThemeProvider } from '../../../src/ui/theme/ThemeContext.js';
const flush = () => new Promise(resolve => setTimeout(resolve, 30));
afterEach(cleanup);

describe('full-screen frame', () => {
  it('shows unread activity above an anchored composer', async () => {
    const model = new FullScreenTranscript();
    let messages = Array.from({ length: 50 }, (_, i) => ({ role: 'assistant' as const, content: `Message ${i}` }));
    const frame = () => <ThemeProvider><FullScreenFrame model={model} messages={messages} rows={24} columns={100} footer={<Text>❯ draft</Text>} /></ThemeProvider>;
    const view = render(frame()); await flush();
    const composerRow = () => stripAnsi(view.lastFrame() ?? '').split('\n').findIndex(line => line.includes('❯ draft'));
    const row = composerRow();
    model.scroll(-20);
    messages = [...messages, { role: 'assistant', content: 'Incoming response' }];
    view.rerender(frame()); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('New activity · ↓ Back to bottom');
    expect(composerRow()).toBe(row);
    model.follow();
    view.rerender(frame()); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).not.toContain('New activity');
    expect(composerRow()).toBe(row);
  });

  it('does not advertise Escape as a history action while inspecting tool details', async () => {
    const model = new FullScreenTranscript();
    const messages = [{ role: 'tool' as const, content: Array.from({ length: 50 }, (_, i) => `Detail ${i}`).join('\n') }];
    const view = render(<ThemeProvider><FullScreenFrame model={model} messages={messages} detailsId="tool-1" rows={24} columns={100} footer={<Text>❯ draft</Text>} /></ThemeProvider>);
    await flush();
    const line = stripAnsi(view.lastFrame() ?? '').split('\n').find(row => row.includes('Back to bottom'));
    expect(line).toContain('Ctrl+End');
    expect(line).not.toContain('Esc');
  });

  it('keeps the composer visible with thousands of transcript rows and a narrow resize', async () => {
    const model = new FullScreenTranscript();
    const messages = [{ role: 'assistant' as const, content: Array.from({ length: 5000 }, (_, i) => `Long output row ${i}`).join('\n\n') }];
    const frame = (rows: number, columns: number) => <ThemeProvider><FullScreenFrame model={model} messages={messages} rows={rows} columns={columns} footer={<Text>❯ preserved draft</Text>} /></ThemeProvider>;
    const view = render(frame(24, 80)); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('❯ preserved draft');
    expect(stripAnsi(view.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(24);
    model.scroll(-30, 15);
    view.rerender(frame(20, 60)); await flush();
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('❯ preserved draft');
    expect(stripAnsi(view.lastFrame() ?? '')).toContain('Ctrl+End');
    expect(stripAnsi(view.lastFrame() ?? '').split('\n').length).toBeLessThanOrEqual(20);
    view.unmount();
  });
});
