import { describe, expect, it } from 'vitest';
import { applyCliModelOverride, applyCliProviderOverride, saveConfig } from '../src/config.js';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { LoadedConfig } from '../src/types.js';

describe('CLI provider override', () => {
  const config: LoadedConfig = { configPath: '/fixture/config.json', provider: 'openai', openai: { model: 'saved-model', apiKey: 'fixture-key' } };

  it('selects account inference for a transferred session without changing saved defaults', () => {
    const selected = applyCliProviderOverride(config, 'autohandai');
    expect(selected.provider).toBe('autohandai');
    expect(selected.autohandai).toMatchObject({ plan: 'cloud', authMode: 'account' });
    expect(config.provider).toBe('openai');
    expect(config.autohandai).toBeUndefined();
    expect(selected.openai).toEqual(config.openai);
  });

  it('preserves explicit provider settings and rejects invalid provider names', () => {
    const selected = applyCliProviderOverride(config, 'openai');
    expect(selected.openai).toEqual(config.openai);
    expect(applyCliProviderOverride(config, undefined)).toBe(config);
    expect(() => applyCliProviderOverride(config, 'not-a-provider')).toThrow('Unknown provider');
  });

  it('selects a hosted model after an Ollama session without mutating the input', () => {
    const local: LoadedConfig = { configPath: '/fixture/config.json', provider: 'ollama', ollama: { model: 'qwen-local' } };
    const selected = applyCliModelOverride(local, 'fantail');
    expect(selected.provider).toBe('autohandai');
    expect(selected.autohandai).toMatchObject({ model: 'fantail', plan: 'cloud', authMode: 'account' });
    expect(local).toEqual({ configPath: '/fixture/config.json', provider: 'ollama', ollama: { model: 'qwen-local' } });
  });

  it('honours an explicit provider and keeps unknown local model IDs on their selected provider', () => {
    const local: LoadedConfig = { configPath: '/fixture/config.json', provider: 'ollama', ollama: { model: 'qwen-local' } };
    expect(applyCliModelOverride(local, 'fantail', 'ollama').provider).toBe('ollama');
    expect(applyCliModelOverride(local, 'my-local-model').ollama?.model).toBe('my-local-model');
    expect(applyCliModelOverride(local, 'autohand/fantail').autohandai?.model).toBe('fantail');
  });

  it.each([true, false])('keeps run-only model/provider settings out of automatic config saves (hosted settings present: %s)', async existingHosted => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-model-override-'));
    try {
      const configPath = path.join(root, 'config.json');
      const local: LoadedConfig = {
        configPath, provider: 'ollama', ollama: { model: 'qwen-local' },
        ...(existingHosted ? { autohandai: { plan: 'cloud' as const, model: 'moa' } } : {}),
      };
      await fs.writeJson(configPath, local);
      const selected = applyCliModelOverride(local, 'fantail');
      selected.ui = { theme: 'dark' };
      await saveConfig(selected);
      const saved = await fs.readJson(configPath);
      expect(saved.provider).toBe('ollama');
      expect(saved.ollama).toEqual(local.ollama);
      expect(saved.autohandai).toEqual(local.autohandai);
      expect(saved.ui).toEqual({ theme: 'dark' });
    } finally {
      await fs.remove(root);
    }
  });
});
