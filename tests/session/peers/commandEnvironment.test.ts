import { expect, it } from 'vitest';
import { executeCoordinatedFile } from '../../../src/session/peers/CommandCoordinationGate.js';

it('passes an isolated child environment without changing the parent', async () => {
  const previous = process.env.AUTOHAND_TEST_CHILD_ENV;
  const result = await executeCoordinatedFile({
    file: process.execPath,
    args: ['-e', 'process.stdout.write(process.env.AUTOHAND_TEST_CHILD_ENV || "missing")'],
    cwd: process.cwd(),
  }, { env: { ...process.env, AUTOHAND_TEST_CHILD_ENV: 'isolated-index' } });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('isolated-index');
  expect(process.env.AUTOHAND_TEST_CHILD_ENV).toBe(previous);
});
