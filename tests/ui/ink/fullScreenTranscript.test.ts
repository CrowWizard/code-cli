import { describe, expect, it } from 'vitest';
import { FullScreenTranscript } from '../../../src/ui/ink/fullScreenTranscript.js';
import type { ChatLogMessage } from '../../../src/session/chatLog.js';

const messages: ChatLogMessage[] = Array.from({ length: 100 }, (_, i) => ({ role: 'assistant', content: `Message ${i} with enough words to wrap on narrow terminals.` }));

describe('full-screen transcript viewport', () => {
  it('renders a bounded tail and preserves the reading anchor when output arrives', () => {
    const model = new FullScreenTranscript();
    model.update(messages, 60);
    expect(model.view(8).lines).toHaveLength(8);
    expect(model.view(8).lines.join('\n')).toContain('Message 99');
    model.scroll(-12, 8);
    const before = model.view(8).lines;
    model.update([...messages, { role: 'assistant', content: 'new streamed answer' }], 60);
    expect(model.view(8).lines).toEqual(before);
    expect(model.view(8).following).toBe(false);
    model.follow();
    expect(model.view(8).lines.join('\n')).toContain('new streamed answer');
  });

  it('opens expanded details at their start and retains their reading position', () => {
    const model = new FullScreenTranscript();
    model.update([...messages, { role: 'tool', content: Array.from({ length: 100 }, (_, i) => `detail ${i}`).join('\n') }], 60);
    model.focusDetails('tool-1');
    expect(model.view(8).lines.join('\n')).toContain('detail 0');
    model.page(1);
    const page = model.view(8).lines;
    model.focusDetails('tool-1');
    expect(model.view(8).lines).toEqual(page);
    model.focusDetails(undefined);
    expect(model.view(8).following).toBe(true);
  });

  it('keeps the anchored message on resize, searches history and resets when history is replaced', () => {
    const model = new FullScreenTranscript();
    model.update(messages, 60);
    expect(model.search('Message 40', 6)).toBe(true);
    expect(model.view(6).lines.join('\n')).toContain('Message 40');
    model.update(messages, 24);
    expect(model.view(6).lines.join('\n')).toContain('Message 40');
    expect(model.search('absent value', 6)).toBe(false);
    model.update([{ role: 'user', content: 'New session' }], 24);
    expect(model.view(6).lines.join('\n')).toContain('New session');
    expect(model.view(6).following).toBe(true);
  });
});
