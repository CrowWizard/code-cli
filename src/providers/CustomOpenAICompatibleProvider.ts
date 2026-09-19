/**
 * @license
 * Copyright 2025 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LLMGatewayClient } from "./LLMGatewayClient.js";
import type { LLMProvider, LLMProviderCapabilities } from "./LLMProvider.js";
import type {
  CustomProviderId,
  CustomProviderSettings,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  NetworkSettings,
} from "../types.js";
import { toCustomProviderName } from "./customProviders.js";
import { ApiError, classifyApiError } from "./errors.js";
import { normalizeLLMUsage } from "./usage.js";
import { writeAutohandDebugLine } from '../utils/debugLog.js';

interface ResponsesFunctionCall {
  type: 'function_call';
  call_id?: string;
  name: string;
  arguments: string;
}

interface ResponsesResponse {
  id?: string;
  created_at?: number;
  output_text?: string;
  output?: Array<ResponsesFunctionCall | { type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: unknown;
  incomplete_details?: { reason?: string };
}

export class CustomOpenAICompatibleProvider implements LLMProvider {
  private readonly providerName: CustomProviderId;
  private readonly client: LLMGatewayClient;
  private readonly models: string[];
  private readonly apiKeyRequired: boolean;
  private readonly apiKey?: string;
  private readonly apiFormat: CustomProviderSettings['apiFormat'];
  private readonly stream: boolean;
  private readonly baseUrl: string;
  private model: string;

  constructor(config: CustomProviderSettings, networkSettings?: NetworkSettings) {
    this.providerName = toCustomProviderName(config.id);
    this.model = config.model;
    this.models = config.models?.map((entry) => entry.id) ?? [config.model];
    this.apiKeyRequired = config.apiKeyRequired !== false;
    this.apiKey = config.apiKey;
    this.apiFormat = config.apiFormat;
    this.stream = config.stream === true;
    this.baseUrl = config.baseUrl?.replace(/\/$/, '') ?? '';
    this.client = new LLMGatewayClient(
      {
        apiKey: config.apiKey ?? "",
        baseUrl: config.baseUrl,
        model: config.model,
      },
      networkSettings,
      {
        serviceName: config.displayName,
        credentialName: `${config.displayName} API key`,
        accountName: `${config.displayName} account`,
      },
    );
  }

  getName(): string {
    return this.providerName;
  }

  getCapabilities(): LLMProviderCapabilities {
    return { nativeToolCalling: true };
  }

  setModel(model: string): void {
    this.model = model;
    this.client.setDefaultModel(model);
  }

  async listModels(): Promise<string[]> {
    return this.models;
  }

  async isAvailable(): Promise<boolean> {
    return !this.apiKeyRequired || Boolean(this.apiKey);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.apiFormat === 'openai-responses') {
      return this.completeWithResponsesApi(request);
    }
    return this.client.complete(request);
  }

  private async completeWithResponsesApi(request: LLMRequest): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.model,
      input: this.toResponsesInput(request),
      stream: this.stream,
      ...(request.promptCache ? { prompt_cache_key: request.promptCache.key } : {}),
    };
    const instructions = request.messages
      .flatMap((message) => {
        if (message.role !== 'system' || typeof message.content !== 'string') return [];
        const content = message.content.trim();
        return content ? [content] : [];
      })
      .join('\n\n');
    if (instructions) body.instructions = instructions;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_output_tokens = request.maxTokens;
    if (request.tools?.length) {
      body.tools = request.tools.map((tool) => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters ?? { type: 'object', properties: {} },
      }));
      body.tool_choice = request.toolChoice ?? 'auto';
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-source': 'Autohand Code CLI',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new ApiError(request.signal?.aborted ? 'Request cancelled.' : 'Request timed out.', request.signal?.aborted ? 'cancelled' : 'timeout', 0, !request.signal?.aborted);
      }
      throw new ApiError(`Unable to connect to ${this.providerName}.`, 'network_error', 0, true);
    }
    if (!response.ok) {
      throw classifyApiError(response.status, await response.text(), response.headers);
    }
    if (this.stream) {
      writeAutohandDebugLine(
        `[RESPONSES SSE] opened provider=${this.providerName} status=${response.status} contentType=${response.headers.get('content-type') ?? '(missing)'}`,
      );
    }

    const data = this.stream
      ? await this.parseResponsesStream(response, request.onTextDelta)
      : await response.json() as ResponsesResponse;
    const toolCalls = this.extractToolCalls(data.output);
    return {
      id: data.id ?? `${this.providerName}-responses-${Date.now()}`,
      created: data.created_at ?? Math.floor(Date.now() / 1000),
      content: this.extractContent(data),
      toolCalls,
      finishReason: toolCalls.length ? 'tool_calls' : data.incomplete_details?.reason ? 'length' : 'stop',
      usage: normalizeLLMUsage(data.usage, 'openai-responses'),
      raw: data,
    };
  }

  private toResponsesInput(request: LLMRequest): Array<Record<string, unknown>> {
    return request.messages.flatMap<Record<string, unknown>>((message) => {
      if (message.role === 'system') return [];
      if (message.role === 'tool' && message.tool_call_id) {
        return [{ type: 'function_call_output', call_id: message.tool_call_id, output: message.content }];
      }
      if (message.role === 'assistant' && message.tool_calls?.length) {
        return message.tool_calls.map((call) => ({
          type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments,
        }));
      }
      const role = message.role === 'assistant' ? 'assistant' : 'user';
      return [{ type: 'message', role, content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: message.content }] }];
    });
  }

  private async parseResponsesStream(response: Response, onTextDelta?: (delta: string) => void): Promise<ResponsesResponse> {
    let event = '';
    let buffer = '';
    let streamedOutputText = '';
    let dataEventCount = 0;
    let malformedDataCount = 0;
    let doneMarkerSeen = false;
    const observedEvents = new Set<string>();
    const logEvent = (type: string, raw: string, data?: Record<string, unknown>): void => {
      if (observedEvents.has(type)) return;
      observedEvents.add(type);
      const fields = data ? Object.keys(data).sort().join(',') || '(none)' : '(unparsed)';
      writeAutohandDebugLine(`[RESPONSES SSE] event=${type || '(missing)'} dataBytes=${raw.length} fields=${fields}`);
    };
    const streamSummary = (): string =>
      `events=${[...observedEvents].join(',') || '(none)'} dataEvents=${dataEventCount} malformedData=${malformedDataCount} deltaChars=${streamedOutputText.length} doneMarker=${doneMarkerSeen}`;
    const recoverStreamedResponse = (): ResponsesResponse | undefined => {
      if (!streamedOutputText.trim()) return undefined;
      writeAutohandDebugLine(`[RESPONSES SSE] recovered partial response ${streamSummary()}`);
      return {
        id: 'streamed-response',
        output_text: streamedOutputText,
        incomplete_details: { reason: 'stream_ended_without_completed' },
      };
    };
    const processLine = (line: string): ResponsesResponse | undefined => {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      if (!line.startsWith('data: ')) return undefined;
      const raw = line.slice(6).trim();
      if (!raw) return undefined;
      dataEventCount++;
      if (raw === '[DONE]') {
        doneMarkerSeen = true;
        logEvent('[DONE]', raw);
        return recoverStreamedResponse();
      }
      let data: { type?: string; response?: ResponsesResponse; delta?: unknown };
      try {
        data = JSON.parse(raw) as { type?: string; response?: ResponsesResponse; delta?: unknown };
      } catch {
        malformedDataCount++;
        logEvent(event || '(missing)', raw);
        return undefined;
      }
      const type = event || data.type;
      logEvent(type || '(missing)', raw, data as Record<string, unknown>);
      if (type === 'response.output_text.delta' && typeof data.delta === 'string') {
        streamedOutputText += data.delta;
        onTextDelta?.(data.delta);
      }
      if (type === 'response.completed' || type === 'response.incomplete') {
        writeAutohandDebugLine(`[RESPONSES SSE] terminal event=${type} ${streamSummary()}`);
        return data.response ?? data as ResponsesResponse;
      }
      if (type === 'response.failed' || type === 'response.error') throw new ApiError(`Responses stream ended with ${type}.`, 'server_error', 0, true);
      return undefined;
    };

    if (!response.body) {
      for (const line of (await response.text()).split('\n')) {
        const terminalResponse = processLine(line);
        if (terminalResponse) return terminalResponse;
      }
      const recoveredResponse = recoverStreamedResponse();
      if (recoveredResponse) return recoveredResponse;
      writeAutohandDebugLine(`[RESPONSES SSE] stream ended without recoverable output ${streamSummary()}`);
      throw new ApiError('Responses stream ended before a terminal response event.', 'server_error', 0, true);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const terminalResponse = processLine(line.replace(/\r$/, ''));
        if (terminalResponse) return terminalResponse;
      }
      if (done) break;
    }
    const terminalResponse = processLine(buffer.replace(/\r$/, ''));
    if (terminalResponse) return terminalResponse;
    const recoveredResponse = recoverStreamedResponse();
    if (recoveredResponse) return recoveredResponse;
    writeAutohandDebugLine(`[RESPONSES SSE] stream ended without recoverable output ${streamSummary()}`);
    throw new ApiError('Responses stream ended before a terminal response event.', 'server_error', 0, true);
  }

  private extractToolCalls(output: ResponsesResponse['output']): LLMToolCall[] {
    return (output ?? [])
      .filter((item): item is ResponsesFunctionCall => item.type === 'function_call')
      .map((call, index) => ({
        id: call.call_id ?? `call_${index + 1}`,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      }));
  }

  private extractContent(data: ResponsesResponse): string {
    if (data.output_text?.trim()) return data.output_text;
    return (data.output ?? [])
      .flatMap((item) => item.type === 'message' ? item.content ?? [] : [])
      .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('\n')
      .trim();
  }
}

