import type { Session } from 'tuistory';
import { waitForTerminalScreen } from '../drivers/tuistory-driver.js';

export async function waitForNormalApprovalStartup(session: Session): Promise<string> {
  return waitForTerminalScreen(session, {
    timeout: 15_000,
    waitFor: text => text.includes('❯') && !text.includes('● AUTO'),
  });
}

export async function requestStartupSafetyWrite(session: Session): Promise<string> {
  await session.waitForText('❯', { timeout: 15_000 });
  await session.type('Create the requested safety-check file.');
  await session.press('enter');
  return waitForTerminalScreen(session, {
    timeout: 15_000,
    waitFor: text => text.includes('Run this shell command'),
  });
}
