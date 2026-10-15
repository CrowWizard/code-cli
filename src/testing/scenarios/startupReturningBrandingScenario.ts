/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Session } from 'tuistory';
import stripAnsi from 'strip-ansi';

export function returningStartupViewport(session: Session): string {
  const terminal = session.getTerminalData();
  return terminal.lines.slice(-terminal.rows)
    .map((line) => line.spans.map((span) => span.text).join('').trimEnd())
    .join('\n').trimEnd();
}

export function returningStartupLogoRows(output: string): string[] {
  return stripAnsi(output).split('\n').map((line) => line.trimEnd())
    .filter((line) => /^[ ()o_*\.\-]+$/u.test(line) && /[()o_*\.\-]/u.test(line));
}
