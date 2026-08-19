import type { LoadedConfig } from '../types.js';
import { isAutohandInferenceEnabled } from '../featureFlags.js';
import {
  AUTOHAND_AI_DEFAULT_BASE_URL,
  getAutohandAICloudModelContextWindow,
} from '../providers/AutohandAIProvider.js';

function hasUserChosenProvider(config: LoadedConfig): boolean {
  if (config.provider === undefined) return false;
  if (config.provider === 'openrouter' && !config.openrouter?.apiKey) return false;
  return true;
}

function applyAutohandAIProviderDefaults(config: LoadedConfig, accountToken: string): LoadedConfig {
  const model = 'fantail';
  return {
    ...config,
    provider: 'autohandai',
    autohandai: {
      plan: 'cloud',
      authMode: 'account',
      accountToken,
      baseUrl: AUTOHAND_AI_DEFAULT_BASE_URL,
      model,
      contextWindow: getAutohandAICloudModelContextWindow(model),
    },
  };
}

export function applyStartupProviderDefaults(config: LoadedConfig): LoadedConfig {
  if (!config.auth?.token) return config;
  if (hasUserChosenProvider(config) || !isAutohandInferenceEnabled(config)) return config;
  return applyAutohandAIProviderDefaults(config, config.auth.token);
}

export interface AutohandSwitchOfferDeps {
  config: LoadedConfig;
  errorCode: string;
  activeProvider: string | undefined;
  providerLabel: string;
  isInteractive: boolean;
  fetchEntitlement: (token: string) => Promise<{ tier: string; freeRemaining: number | null } | null>;
  confirm: (message: string) => Promise<boolean>;
  persist: (config: LoadedConfig) => Promise<void>;
}

export async function maybeOfferAutohandAISwitch(deps: AutohandSwitchOfferDeps): Promise<LoadedConfig> {
  const { config } = deps;
  const token = config.auth?.token;

  if (deps.errorCode !== 'rate_limited' && deps.errorCode !== 'payment_required') return config;
  if (deps.activeProvider === 'autohandai') return config;
  if (!token || !isAutohandInferenceEnabled(config)) return config;
  if (config.autohandaiSwitchPromptShown) return config;
  if (!deps.isInteractive) return config;

  let entitlement: { tier: string; freeRemaining: number | null } | null;
  try {
    entitlement = await deps.fetchEntitlement(token);
  } catch {
    return config;
  }
  if (!entitlement) return config;
  const hasRoom = entitlement.tier !== 'free' || (entitlement.freeRemaining ?? 0) > 0;
  if (!hasRoom) return config;

  let next: LoadedConfig = { ...config, autohandaiSwitchPromptShown: true };
  if (await deps.confirm(`Your ${deps.providerLabel} hit a rate limit. Try Autohand's Fantail model instead?`)) {
    next = applyAutohandAIProviderDefaults(next, token);
  }
  await deps.persist(next);
  return next;
}