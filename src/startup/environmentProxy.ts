/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

function environmentValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const upper = name.toUpperCase();
  if (env[name] !== undefined) return env[name];
  if (env[upper] !== undefined) return env[upper];
  const key = Object.keys(env).find(candidate => candidate.toLowerCase() === name);
  return key ? env[key] : undefined;
}

/** Register before any startup/provider requests; Bun already handles these variables. */
export function installEnvironmentProxy(
  env: NodeJS.ProcessEnv = process.env,
  runtime: 'node' | 'bun' = process.versions.bun ? 'bun' : 'node',
): EnvHttpProxyAgent | undefined {
  if (runtime === 'bun') return;
  const httpProxy = environmentValue(env, 'http_proxy');
  const httpsProxy = environmentValue(env, 'https_proxy');
  if (!httpProxy && !httpsProxy) return;
  let agent: EnvHttpProxyAgent;
  try {
    agent = new EnvHttpProxyAgent({
      httpProxy: httpProxy ?? '',
      httpsProxy: httpsProxy ?? '',
      noProxy: environmentValue(env, 'no_proxy') ?? '',
    });
  } catch {
    // URL parser errors can include the proxy username/password in their input.
    throw new Error('Invalid proxy configuration. Check HTTP_PROXY and HTTPS_PROXY.');
  }
  setGlobalDispatcher(agent);
  return agent;
}
