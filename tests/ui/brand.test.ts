import { afterEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { formatBrandLogo, resolveBrandColorMode, shouldAnimateBrand } from '../../src/ui/brand.js';

afterEach(() => vi.unstubAllEnvs());

describe('portable monochrome brand rendering', () => {
  it('keeps one inherited foreground instead of cycling a rainbow palette', () => {
    const art = ' .##.  .##.\n+#  #++#  #+\n .##.  .##.';
    const first = formatBrandLogo(art, 0, 'truecolor');
    const next = formatBrandLogo(art, 8, 'truecolor');
    expect(next).toBe(first);
    expect(stripAnsi(first)).toBe(art);
    expect(stripAnsi(next)).toBe(art);
    expect(first).toContain('\x1b[2m');
    expect(first).not.toContain('\x1b[38;');
    expect(first.replace(/\x1b\[[\d;]+m/g, '')).toBe(art);
    expect(first).not.toMatch(/\x1b\[[^m]*[HJAB]/);
  });

  it.each(['256', '16', 'none'] as const)('degrades to %s colour without altering geometry', (mode) => {
    const art = '.+#@ .+#@';
    const frame = formatBrandLogo(art, 3, mode);
    expect(stripAnsi(frame)).toBe(art);
    expect(frame).not.toContain(';2;');
    if (mode !== 'none') expect(frame).toContain('\x1b[2m');
    if (mode === 'none') expect(frame).toBe(art);
  });

  it('respects NO_COLOR, redirected output, and dumb terminals', () => {
    vi.stubEnv('FORCE_COLOR', '3');
    expect(resolveBrandColorMode(false)).toBe('none');
    vi.stubEnv('TERM', 'dumb');
    expect(resolveBrandColorMode(true)).toBe('none');
    vi.stubEnv('TERM', 'xterm-256color');
    vi.stubEnv('NO_COLOR', '');
    expect(resolveBrandColorMode(true)).toBe('none');
  });

  it('honours reduced motion and explicit static presentation', () => {
    expect(shouldAnimateBrand(true, 'truecolor', true)).toBe(true);
    expect(shouldAnimateBrand(false, 'truecolor', true)).toBe(false);
    expect(shouldAnimateBrand(true, 'none', true)).toBe(false);
    expect(shouldAnimateBrand(true, 'truecolor', false)).toBe(false);
    vi.stubEnv('AUTOHAND_REDUCED_MOTION', '1');
    expect(shouldAnimateBrand(true, 'truecolor', true)).toBe(false);
  });

  it('keeps the foreground stable and leaves whitespace untouched', () => {
    const art = '  # #  \n  + +  ';
    expect(formatBrandLogo(art, 0, '256')).toBe(formatBrandLogo(art, 48, '256'));
    expect(stripAnsi(formatBrandLogo(art, 47, '256'))).toBe(art);
  });
});
