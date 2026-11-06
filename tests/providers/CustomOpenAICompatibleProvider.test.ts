/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'node:path';
import { ErrorLogger } from '../../src/core/errorLogger.js';
import { CustomOpenAICompatibleProvider } from '../../src/providers/CustomOpenAICompatibleProvider.js';
import { getSessionPromptCacheDirective, isPromptCachingEnabled, PROMPT_CACHING_KILL_SWITCH_ID } from '../../src/core/agent/PromptCache.js';
import type { LoadedConfig } from '../../src/types.js';

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

  it.each([false, true])('forwards stable session cache affinity through the Responses API with stream=%s', async (stream) => {
    const provider = new CustomOpenAICompatibleProvider({
      id: 'cache-test', displayName: 'Cache Test', apiFormat: 'openai-responses',
      baseUrl: 'https://example.com/v1', model: 'test-model', apiKey: 'test-key', stream,
    });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(stream
      ? `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { output_text: 'ok' } })}\n\n`
      : JSON.stringify({ output_text: 'ok' }), {
      headers: { 'Content-Type': stream ? 'text/event-stream' : 'application/json' },
    }));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    const config = { provider: 'custom:cache-test', features: { promptCaching: true } } as LoadedConfig;
    const killSwitch = {
      isFeatureEnabled: (_key: string, localDefault = false) => localDefault,
      getSnapshot: () => ({ flags: [{ key: PROMPT_CACHING_KILL_SWITCH_ID, enabled: true }] }),
    };
    const cases = [
      { config, sessionId: 'session-a' },
      { config, sessionId: 'session-a' },
      { config, sessionId: 'session-b' },
      { config: { ...config, features: { promptCaching: false } }, sessionId: 'session-a' },
      { config, sessionId: 'session-a', flags: killSwitch },
    ];
    for (const entry of cases) {
      const promptCache = isPromptCachingEnabled(entry.config, entry.flags)
        ? getSessionPromptCacheDirective(entry.sessionId) : undefined;
      await provider.complete({ messages: [{ role: 'user', content: 'Hello' }], promptCache });
    }
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
    expect(bodies[0].prompt_cache_key).toMatch(/^ahpc_/);
    expect(bodies[1].prompt_cache_key).toBe(bodies[0].prompt_cache_key);
    expect(bodies[2].prompt_cache_key).not.toBe(bodies[0].prompt_cache_key);
    expect(bodies[0].prompt_cache_key).not.toContain('session-a');
    expect(bodies[3]).not.toHaveProperty('prompt_cache_key');
    expect(bodies[4]).not.toHaveProperty('prompt_cache_key');
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

  it('logs cache affinity and provider-reported cache usage without logging the key', async () => {
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
    const cacheKey = 'ahpc_private-session-key';
    const sseBody = [
      'event: response.completed',
      `data: ${JSON.stringify({
        type: 'response.completed',
        response: {
          output_text: 'ok',
          usage: {
            input_tokens: 120,
            output_tokens: 8,
            input_tokens_details: { cached_tokens: 100 },
          },
        },
      })}`,
      '',
    ].join('\n');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    try {
      await provider.complete({
        messages: [{ role: 'user', content: 'Say hello.' }],
        promptCache: { key: cacheKey },
      });

      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('[RESPONSES CACHE] request cacheKey=present'));
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('inputTokens=120'));
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('cacheReadTokens=100'));
      expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining(cacheKey));
      const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
      expect(body.prompt_cache_key).toBe(cacheKey);
    } finally {
      stderr.mockRestore();
      if (previousDebug === undefined) delete process.env.AUTOHAND_DEBUG;
      else process.env.AUTOHAND_DEBUG = previousDebug;
    }
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

  it.each(['response.failed', 'response.error'])('preserves upstream details and request IDs for %s without debugging', async (type) => {
    vi.stubEnv('AUTOHAND_DEBUG', '0');
    const provider = new CustomOpenAICompatibleProvider({
      id: 'ailili',
      displayName: 'AILILI',
      apiFormat: 'openai-responses',
      baseUrl: 'https://ailili.chat/v1',
      model: 'gpt-5.6-terra',
      stream: true,
    });
    const message = `Upstream rejected sk-original-value\n${'detail '.repeat(60)}`;
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response([
      `event: ${type}`,
      `data: ${JSON.stringify({ type, request_id: 'req-event', response: {
        id: 'resp-failed', error: { code: 'upstream_rejected', message },
      } })}`,
      '',
    ].join('\n'), { headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'req-http' } })) as typeof globalThis.fetch;

    try {
      await expect(provider.complete({ messages: [{ role: 'user', content: 'Hello' }] }))
        .rejects.toThrow(`Responses stream ended with ${type}. code=upstream_rejected message=${message} request_id=req-event x-request-id=req-http response_id=resp-failed`);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('persists the original failure and all available request headers in error.log without debugging', async () => {
    vi.stubEnv('AUTOHAND_DEBUG', '0');
    const logDir = await fs.mkdtemp(path.join(process.cwd(), '.responses-error-test-'));
    const logger = new ErrorLogger('test', logDir);
    const provider = new CustomOpenAICompatibleProvider({
      id: 'fixture', displayName: 'Fixture', apiFormat: 'openai-responses',
      baseUrl: 'https://example.com/v1', model: 'fixture', stream: true,
    });
    const message = `Rejected Bearer original-token\n${'original detail '.repeat(60)}`;
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response([
      `data: ${JSON.stringify({ type: 'response.failed', response: {
        id: 'resp-original', request_id: 'req-response', error: { code: 'upstream_error', message },
      } })}`, '',
    ].join('\n'), { headers: {
      'x-request-id': 'req-http', 'request-id': 'req-alternate',
      'x-autohand-request-id': 'req-autohand', 'x-autohand-client-request-id': 'req-client',
    } })) as typeof globalThis.fetch;
    try {
      const error = await provider.complete({ messages: [{ role: 'user', content: 'Hello' }] })
        .catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof Error)) throw new Error('Expected provider failure');
      await logger.log(error);
      const entries = await logger.getRecentErrors();
      expect(entries).toHaveLength(1);
      expect(entries[0].error.message).toBe(`Responses stream ended with response.failed. code=upstream_error message=${message} request_id=req-response x-request-id=req-http request-id=req-alternate x-autohand-request-id=req-autohand x-autohand-client-request-id=req-client response_id=resp-original`);
    } finally {
      await fs.remove(logDir);
      vi.unstubAllEnvs();
    }
  });

  it('logs original error details when a Responses stream fails', async () => {
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
      new Response([
        'event: response.failed',
        `data: ${JSON.stringify({
          type: 'response.failed',
          response: {
            error: {
              code: 'invalid_api_key',
              type: 'authentication_error',
              message: 'Invalid API key sk-secret-value',
            },
          },
        })}`,
        '',
      ].join('\n'), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    ) as typeof globalThis.fetch;

    try {
      await expect(provider.complete({ messages: [{ role: 'user', content: 'Sensitive prompt' }] }))
        .rejects.toThrow('Responses stream ended with response.failed.');

      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('code=invalid_api_key'));
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('message=Invalid API key sk-secret-value'));
      expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining('Sensitive prompt'));
    } finally {
      stderr.mockRestore();
      if (previousDebug === undefined) delete process.env.AUTOHAND_DEBUG;
      else process.env.AUTOHAND_DEBUG = previousDebug;
    }
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