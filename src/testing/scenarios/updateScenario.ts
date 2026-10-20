import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function writeUpdateFetchFixture(directory: string): Promise<string> {
  const file = path.join(directory, 'update-fetch-fixture.mjs');
  await writeFile(file, `
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith('https://api.github.com/repos/autohandai/code-cli/releases')) {
    return new Response(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://example.com/fixture-release' }));
  }
  return originalFetch(input, init);
};
`);
  return pathToFileURL(file).href;
}
