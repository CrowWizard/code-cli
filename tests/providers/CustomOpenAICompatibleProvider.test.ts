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
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ailili.chat/v1/responses',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      model: 'gpt-5.6-terra',
      stream: true,
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
});