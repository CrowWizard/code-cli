import type { Session } from 'tuistory';

export async function runCheckpointFooterScenario(session: Session): Promise<string> {
  await session.waitForText('❯', { timeout: 20_000 });
  await session.type('Read package.json and summarize the verified repository facts.');
  await session.press('enter');
  return session.text({ timeout: 20_000, waitFor: text =>
    (text.includes('Work remains pending Moa review') || text.includes('CHECKPOINT_FOOTER_ANSWER'))
    && (text.includes('Failed in') || text.includes('Completed in')),
  });
}
