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
