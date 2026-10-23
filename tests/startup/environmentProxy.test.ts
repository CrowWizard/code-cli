import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getGlobalDispatcher, setGlobalDispatcher, type EnvHttpProxyAgent } from 'undici';
import { installEnvironmentProxy } from '../../src/startup/environmentProxy.js';

const previous = getGlobalDispatcher();
const agents: EnvHttpProxyAgent[] = [];
afterEach(async () => {
  setGlobalDispatcher(previous);
  await Promise.all(agents.splice(0).map(agent => agent.destroy()));
});
function install(env: NodeJS.ProcessEnv, runtime: 'node' | 'bun' = 'node') {
  const agent = installEnvironmentProxy(env, runtime);
  if (agent) agents.push(agent);
  return agent;
}

describe('Node environment proxy startup (F-0155)', () => {
  it('keeps the existing dispatcher when no proxy is set, or when Bun handles proxying', () => {
    expect(install({})).toBeUndefined();
    expect(install({ HTTPS_PROXY: 'http://127.0.0.1:9' }, 'bun')).toBeUndefined();
    expect(getGlobalDispatcher()).toBe(previous);
  });

  it.each(['HTTP_PROXY', 'http_proxy', 'Http_Proxy'])('routes global fetch through %s', async key => {
    install({ [key]: 'http://127.0.0.1:9' });
    try {
      await fetch('http://destination.invalid', { signal: AbortSignal.timeout(2000) });
      throw new Error('Expected the closed proxy to reject the connection');
    } catch (error) {
      expect((error as { cause?: { code?: string } }).cause?.code).toBe('ECONNREFUSED');
    }
  });

  it('uses the HTTPS proxy for HTTPS global fetch', async () => {
    install({ HTTPS_PROXY: 'http://127.0.0.1:9' });
    await expect(fetch('https://destination.invalid', { signal: AbortSignal.timeout(2000) }))
      .rejects.toMatchObject({ cause: { code: 'ECONNREFUSED' } });
  });

  it.each(['NO_PROXY', 'no_proxy', 'No_Proxy'])('bypasses the closed proxy for %s hosts', async key => {
    const server = createServer((_request, response) => response.end('direct destination'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
      install({ HTTP_PROXY: 'http://127.0.0.1:9', [key]: '127.0.0.1' });
      const response = await fetch(`http://127.0.0.1:${port}`);
      expect(await response.text()).toBe('direct destination');
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('gives lowercase proxy and no_proxy values precedence over uppercase ones', async () => {
    install({ http_proxy: 'http://127.0.0.1:9', HTTP_PROXY: 'http://destination.invalid:99', no_proxy: 'unmatched.invalid', NO_PROXY: '*' });
    await expect(fetch('http://destination.invalid', { signal: AbortSignal.timeout(2000) }))
      .rejects.toMatchObject({ cause: { code: 'ECONNREFUSED' } });
  });
  it('does not expose proxy credentials when configuration is invalid', () => {
    expect(() => install({ HTTPS_PROXY: 'invalid://user:secret-password@proxy' }))
      .toThrow('Invalid proxy configuration');
  });

});
