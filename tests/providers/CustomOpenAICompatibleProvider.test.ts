/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomOpenAICompatibleProvider } from '../../src/providers/CustomOpenAICompatibleProvider.js';

describe('CustomOpenAICompatibleProvider', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it.each([true, false, undefined])('serializes Responses image input with supportsImageInput=%s', async (supportsImageInput) => {
    const provider = new CustomOpenAICompatibleProvider({
      id: 'vision', displayName: 'Vision', apiFormat: 'openai-responses',
      baseUrl: 'https://example.com/v1', model: 'vision-model', apiKey: 'test-key',
      supportsImageInput,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'ok' })));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    await provider.complete({ messages: [{ role: 'user', content: [
      { type: 'text', text: 'Describe' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
      { type: 'text', text: 'this image' },
    ] }] });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.input[0].content).toEqual(supportsImageInput ? [
      { type: 'input_text', text: 'Describe' },
      { type: 'input_image', image_url: 'data:image/png;base64,aGVsbG8=' },
      { type: 'input_text', text: 'this image' },
    ] : [{ type: 'input_text', text: 'Describe\n[Image input omitted because this provider does not support image inputs.]\nthis image' }]);
  });

  it('preserves image input for a custom Chat Completions provider when enabled', async () => {
    const provider = new CustomOpenAICompatibleProvider({
      id: 'vision', displayName: 'Vision', apiFormat: 'openai-compatible',
      baseUrl: 'https://example.com/v1', model: 'vision-model', apiKey: 'test-key',
      supportsImageInput: true,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    })));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const content = [
      { type: 'text' as const, text: 'Describe' },
      { type: 'image_url' as const, image_url: { url: 'https://example.com/image.png' } },
    ];
    await provider.complete({ messages: [{ role: 'user', content }] });
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.messages).toEqual([{ role: 'user', content }]);
  });

  it('uses the streamed Responses API when configured', async () => {
    const provider = new CustomOpenAICompatibleProvider({
      id: 'ailili',
      displayName: 'AILILI',
      apiFormat: 'openai-responses',
      baseUrl: 'https://ailili.chat/v1',
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
      stream: true,
    });
    const sseBody = [
      'event: response.completed',
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_ailili',
          created_at: 1234567890,
          output_text: 'Streamed response',
          output: [],
          usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
        },
      })}`,
      '',
    ].join('\n');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await provider.complete({
      messages: [
        { role: 'system', content: 'You are a coding agent.' },
        { role: 'user', content: 'Implement this change.' },
      ],
      promptCache: { key: 'ahpc_test-session' },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ailili.chat/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      model: 'gpt-5.6-terra',
      stream: true,
      prompt_cache_key: 'ahpc_test-session',
      instructions: 'You are a coding agent.',
      input: [{
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Implement this change.' }],
      }],
    });
    expect(result).toMatchObject({
      id: 'resp_ailili',
      content: 'Streamed response',
      finishReason: 'stop',
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
  });

  it('reports Responses API text deltas while consuming an SSE stream', async () => {
    const provider = new CustomOpenAICompatibleProvider({
      id: 'ailili',
      displayName: 'AILILI',
      apiFormat: 'openai-responses',
      baseUrl: 'https://ailili.chat/v1',
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
      stream: true,
    });
    const sseBody = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hello "}',
      '',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"world"}',
      '',
      'event: response.completed',
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: { id: 'resp_ailili', output_text: 'Hello world', output: [] },
      })}`,
      '',
    ].join('\n');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    ) as typeof globalThis.fetch;
    const onTextDelta = vi.fn();

    await provider.complete({
      messages: [{ role: 'user', content: 'Say hello.' }],
      onTextDelta,
    });

    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(onTextDelta).toHaveBeenNthCalledWith(1, 'Hello ');
    expect(onTextDelta).toHaveBeenNthCalledWith(2, 'world');
  });

  it('uses accumulated text when a Responses-compatible stream ends with [DONE]', async () => {
    const provider = new CustomOpenAICompatibleProvider({
      id: 'ailili',
      displayName: 'AILILI',
      apiFormat: 'openai-responses',
      baseUrl: 'https://ailili.chat/v1',
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
      stream: true,
    });
    const sseBody = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Partial "}',
      '',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"response"}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    ) as typeof globalThis.fetch;

    const result = await provider.complete({
      messages: [{ role: 'user', content: 'Say hello.' }],
    });

    expect(result).toMatchObject({
      content: 'Partial response',
      finishReason: 'length',
    });
  });

  it('writes privacy-safe SSE diagnostics when a stream has no terminal event or text', async () => {
    const previousDebug = process.env.AUTOHAND_DEBUG;
    process.env.AUTOHAND_DEBUG = '1';
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const provider = new CustomOpenAICompatibleProvider({
      id: 'ailili',
      displayName: 'AILILI',
      apiFormat: 'openai-responses',
      baseUrl: 'https://ailili.chat/v1',
      apiKey: 'test-key',
      model: 'gpt-5.6-terra',
      stream: true,
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response('event: response.created\ndata: {"type":"response.created","response":{"id":"secret-response"}}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    ) as typeof globalThis.fetch;

    await expect(provider.complete({ messages: [{ role: 'user', content: 'Sensitive prompt' }] }))
      .rejects.toThrow('Responses stream ended before a terminal response event.');

    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('[RESPONSES SSE] stream ended without recoverable output'));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('events=response.created'));
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining('secret-response'));
    stderr.mockRestore();
    if (previousDebug === undefined) delete process.env.AUTOHAND_DEBUG;
    else process.env.AUTOHAND_DEBUG = previousDebug;
  });
});