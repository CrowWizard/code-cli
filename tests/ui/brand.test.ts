import { afterEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { formatBrandLogo, resolveBrandColorMode, shouldAnimateBrand } from '../../src/ui/brand.js';
import { BRAND_FRAME_COUNT } from '../../src/ui/brand.js';

afterEach(() => vi.unstubAllEnvs());

describe('portable monochrome brand rendering', () => {
  it('keeps a monochrome terminal animation moving when NO_COLOR disables ANSI colour', () => {
    vi.stubEnv('TERM', 'xterm-256color');
    vi.stubEnv('NO_COLOR', '1');
    vi.stubEnv('AUTOHAND_REDUCED_MOTION', undefined);
    expect(shouldAnimateBrand(true, 'none')).toBe(true);
    vi.stubEnv('TERM', 'dumb');
    expect(shouldAnimateBrand(true, 'none')).toBe(false);
  });

  it('sweeps achromatic light over the body without introducing coloured foregrounds', () => {
    const art = '  _p8888q_  \n  Y8    8P  \n   Y8888P   ';
    const first = formatBrandLogo(art, 0, 'truecolor');
    const later = formatBrandLogo(art, 20, 'truecolor');
    expect(first).not.toBe(later);
    expect(stripAnsi(first)).toBe(art);
    expect(stripAnsi(later)).toBe(art);
    expect(first + later).not.toMatch(/\x1b\[(?:38|48);/u);
  });

  it('keeps one inherited foreground instead of cycling a rainbow palette', () => {
    const art = ' .##.  .##.\n+#  #++#  #+\n .##.  .##.';
    const first = formatBrandLogo(art, 0, 'truecolor');
    const next = formatBrandLogo(art, 8, 'truecolor');
    expect(next).not.toBe(first);
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
    expect(shouldAnimateBrand(true, 'none', true)).toBe(true);
    expect(shouldAnimateBrand(true, 'truecolor', false)).toBe(false);
    vi.stubEnv('AUTOHAND_REDUCED_MOTION', '1');
    expect(shouldAnimateBrand(true, 'truecolor', true)).toBe(false);
  });

  it('keeps the foreground stable and leaves whitespace untouched', () => {
    const art = '  # #  \n  + +  ';
    expect(formatBrandLogo(art, 0, '256')).toBe(formatBrandLogo(art, BRAND_FRAME_COUNT, '256'));
    expect(stripAnsi(formatBrandLogo(art, 47, '256'))).toBe(art);
  });
});
