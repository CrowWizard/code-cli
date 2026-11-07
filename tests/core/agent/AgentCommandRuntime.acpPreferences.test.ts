import { describe, expect, it, vi } from "vitest";
import { applyAgentAcpConfigOption, prepareAgentAcpProviderModel } from "../../../src/core/agent/AgentCommandRuntime.js";
describe("Autohand ACP effort", () => {
  it("keeps the old client until commit and sends the next request to the selected provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "new-provider" } }] }), { headers: { "content-type": "application/json" } }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const shared = { provider: "custom:first", customProviders: {
        first: { id: "first", displayName: "First", apiFormat: "openai-compatible", baseUrl: "https://first.example/v1", model: "old-model", apiKey: "test" },
        second: { id: "second", displayName: "Second", apiFormat: "openai-compatible", baseUrl: "https://second.example/v1", model: "new-model", apiKey: "test", contextWindow: 32000 },
      } };
      const previousClient = { complete: vi.fn() };
      const host = { runtime: { config: structuredClone(shared), options: {} }, llm: previousClient, activeProvider: "custom:first", delegator: { withProvider: vi.fn().mockReturnValue({}) }, contextOrchestrator: { setModel: vi.fn(), setContextWindow: vi.fn() }, syncProviderModelStatusLine: vi.fn(), emitStatus: vi.fn(), contextWindow: 0 };
      const commit = prepareAgentAcpProviderModel(host, "custom:second", "new-model");
      expect(host.llm).toBe(previousClient);
      expect(host.activeProvider).toBe("custom:first");
      commit();
      expect(shared.provider).toBe("custom:first");
      expect(host.activeProvider).toBe("custom:second");
      expect(host.contextWindow).toBe(32000);
      await host.llm.complete({ messages: [{ role: "user", content: "hello" }] });
      const [input, init] = fetchMock.mock.calls[0];
      const request = input instanceof Request ? input : new Request(input, init);
      expect(request.url).toBe("https://second.example/v1/chat/completions");
      expect(await request.json()).toMatchObject({ model: "new-model" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  it("updates the live provider while isolating the session from the shared config", () => {
    const config = {provider:"autohandai",autohandai:{plan:"cloud",model:"moa",reasoningEffort:"high"}};
    const setReasoningEffort=vi.fn();
    const host={runtime:{config},llm:{setReasoningEffort}};
    applyAgentAcpConfigOption(host,"reasoning_effort","xhigh");
    expect(setReasoningEffort).toHaveBeenCalledWith("xhigh");
    expect(host.runtime.config.autohandai.reasoningEffort).toBe("xhigh");
    expect(config.autohandai.reasoningEffort).toBe("high");
    applyAgentAcpConfigOption(host,"reasoning_effort","invalid");
    expect(setReasoningEffort).toHaveBeenCalledTimes(1);
  });
});
