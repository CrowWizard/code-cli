/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fse from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autohandTheme,
  builtInThemes,
  getBuiltInTheme,
  getDefaultThemeName,
  isBuiltInTheme,
} from '../../../src/ui/theme/themes.js';
import {
  ALL_COLOR_TOKENS,
  COLOR_TOKENS,
  DERIVED_COLOR_TOKENS,
  isHexColor,
  type ColorToken,
  type CoreColorToken,
} from '../../../src/ui/theme/types.js';
import { listAvailableThemes, loadTheme, resolveThemeColors, validateAndMergeTheme } from '../../../src/ui/theme/loader.js';
import { Theme, hexToRgb, setTheme, themedFgIfSet } from '../../../src/ui/theme/Theme.js';
import { createCommandTheme } from '../../../src/commands/commandTheme.js';
import { formatStartupBanner } from '../../../src/ui/theme/startup.js';
import { configureRunConfigOverlay } from '../../../src/runConfigOverlay.js';

const CANVAS = '#08090A';

/** Tokens allowed to carry red, green or amber. Everything else is neutral. */
const STATUS_TOKENS: readonly ColorToken[] = ['success', 'error', 'warning', 'diffAdded', 'diffRemoved'];

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`Expected a hex color, received ${hex}`);
  const linear = [rgb.r, rgb.g, rgb.b].map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const light = luminance(foreground);
  const dark = luminance(background);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

/** Hue in degrees and chroma (0-1) of a hex colour. */
function hueAndChroma(hex: string): { hue: number; chroma: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`Expected a hex color, received ${hex}`);
  const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return { hue: 0, chroma };
  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;
  return { hue: (hue * 60 + 360) % 360, chroma };
}

describe('autohand brand theme', () => {
  const theme = loadTheme('autohand');
  const colors = Object.fromEntries(ALL_COLOR_TOKENS.map(token => [token, theme.getColor(token)])) as Record<ColorToken, string>;

  it('is registered as a built-in theme and offered wherever themes are listed', () => {
    expect(isBuiltInTheme('autohand')).toBe(true);
    expect(getBuiltInTheme('autohand')).toBe(autohandTheme);
    expect(builtInThemes.autohand).toBe(autohandTheme);
    expect(listAvailableThemes()).toContain('autohand');
  });

  it('is not the default theme', () => {
    expect(getDefaultThemeName()).toBe('aurora');
  });

  it('defines every token, core and optional, as a hex colour', () => {
    for (const token of ALL_COLOR_TOKENS) {
      expect(autohandTheme.colors[token], token).toBeDefined();
      expect(isHexColor(theme.colors[token]), `${token}: ${theme.colors[token]}`).toBe(true);
    }
  });

  it('uses the BRAND.md v1.1 dark palette', () => {
    expect(colors.text).toBe('#F4F7F5');
    expect(colors.accent).toBe('#F4F7F5');
    expect(colors.dim).toBe('#C9CBCA');
    expect(colors.muted).toBe('#8E908F');
    expect(colors.border).toBe('#2A2E36');
    expect(colors.userMessageBg).toBe('#171A1F');
    expect(colors.userMessageText).toBe('#F4F7F5');
    expect(colors.composerBorder).toBe('#2A2E36');
    expect(colors.selectionBg).toBe('#F4F7F5');
    expect(colors.selectionText).toBe(CANVAS);
  });

  it('has no blue, teal or cyan token', () => {
    for (const token of ALL_COLOR_TOKENS) {
      const { hue, chroma } = hueAndChroma(colors[token]);
      const isCoolHue = hue >= 150 && hue <= 270;
      expect(isCoolHue && chroma > 0.08, `${token} ${colors[token]} hue ${hue.toFixed(0)}`).toBe(false);
    }
  });

  it('keeps status colours on the status tokens only', () => {
    for (const token of ALL_COLOR_TOKENS) {
      const { chroma } = hueAndChroma(colors[token]);
      if (STATUS_TOKENS.includes(token)) {
        expect(chroma, `${token} should be a status colour`).toBeGreaterThan(0.3);
      } else {
        expect(chroma, `${token} ${colors[token]} should be neutral`).toBeLessThanOrEqual(0.06);
      }
    }
    expect(colors.error).toBe(colors.diffRemoved);
    expect(colors.success).toBe(colors.diffAdded);
    expect(new Set([colors.success, colors.error, colors.warning]).size).toBe(3);
    expect(hueAndChroma(colors.error).hue < 15 || hueAndChroma(colors.error).hue > 345).toBe(true);
    expect(hueAndChroma(colors.success).hue).toBeGreaterThan(90);
    expect(hueAndChroma(colors.success).hue).toBeLessThan(150);
    expect(hueAndChroma(colors.warning).hue).toBeGreaterThan(30);
    expect(hueAndChroma(colors.warning).hue).toBeLessThan(50);
  });

  it('keeps status colours at 4.5:1 or better on the canvas, composer and tool surfaces', () => {
    for (const background of [CANVAS, colors.userMessageBg, colors.toolPendingBg, colors.toolSuccessBg, colors.toolErrorBg]) {
      for (const token of STATUS_TOKENS) {
        expect(contrastRatio(colors[token], background), `${token} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const token of ['text', 'dim', 'muted', 'toolOutput', 'mdLinkUrl', 'syntaxComment'] as const) {
        expect(contrastRatio(colors[token], background), `${token} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrastRatio(colors.userMessageText, colors.userMessageBg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colors.selectionText, colors.selectionBg)).toBeGreaterThanOrEqual(7);
  });

  it('renders selected rows inverse, ink on canvas', () => {
    const truecolor = new Theme('autohand', theme.colors, 'truecolor');
    expect(truecolor.selected('▸ autohand')).toBe('\x1b[38;2;8;9;10m\x1b[48;2;244;247;245m▸ autohand\x1b[0m');
  });

  it('falls back to greys, not blue, in 256-colour and 16-colour terminals', () => {
    const indexOf = (code: string) => Number(/;5;(\d+)m/.exec(code)?.[1]);
    const ansi256 = new Theme('autohand', theme.colors, '256', { neutralGreys256: true });
    expect(indexOf(ansi256.bg('userMessageBg', 'x'))).toBe(234);
    expect(indexOf(ansi256.fg('composerBorder', 'x'))).toBe(236);
    expect(indexOf(ansi256.fg('text', 'x'))).toBe(231);
    for (const token of ALL_COLOR_TOKENS.filter(token => !STATUS_TOKENS.includes(token))) {
      const index = indexOf(ansi256.fg(token, 'x'));
      expect(index === 16 || index === 231 || index >= 232, `${token} -> ${index}`).toBe(true);
    }
    const ansi16 = new Theme('autohand', theme.colors, '16', { neutralGreys256: true });
    for (const token of ALL_COLOR_TOKENS) {
      expect(ansi16.fg(token, 'x'), token).not.toMatch(/\x1b\[(?:34|36|94|96)m/);
      expect(ansi16.bg(token, 'x'), token).not.toMatch(/\x1b\[(?:44|46|104|106)m/);
    }
  });

  it('draws the startup logo grid in ink only', async () => {
    setTheme(new Theme('autohand', theme.colors, 'truecolor'));
    const banner = formatStartupBanner('● ○\n○ ●\n● ●');
    const codes = new Set(banner.match(/\x1b\[38;2;[\d;]+m/g));
    expect([...codes]).toEqual(['\x1b[38;2;244;247;245m']);
  });
});

describe('command output under the autohand theme', () => {
  afterEach(() => setTheme(loadTheme('aurora')));

  it('recolours fixed command colours in ink and leaves other themes on their own colours', () => {
    const cyan = (value: string) => `<cyan>${value}</cyan>`;
    setTheme(new Theme('autohand', loadTheme('autohand').colors, 'truecolor'));
    expect(themedFgIfSet('commandAccent', '/help', cyan)).toBe('\x1b[38;2;244;247;245m/help\x1b[39m');
    for (const name of Object.keys(builtInThemes).filter(name => name !== 'autohand')) {
      setTheme(new Theme(name, loadTheme(name).colors, 'truecolor'));
      expect(themedFgIfSet('commandAccent', '/help', cyan), name).toBe('<cyan>/help</cyan>');
    }
  });

  it('draws selected command tabs inverse instead of ink on ink', () => {
    setTheme(new Theme('autohand', loadTheme('autohand').colors, 'truecolor'));
    expect(createCommandTheme().selectedTab('Usage')).toBe('\x1b[38;2;8;9;10m\x1b[48;2;244;247;245m Usage \x1b[0m');
    const aurora = new Theme('aurora', loadTheme('aurora').colors, 'truecolor');
    setTheme(aurora);
    expect(createCommandTheme().selectedTab('Usage')).toBe(aurora.fgBg('userMessageText', 'accent', ' Usage '));
  });
});

describe('optional theme tokens', () => {
  const otherThemes = Object.values(builtInThemes).filter(theme => theme.name !== 'autohand');

  it.each(otherThemes.map(theme => theme.name))('leave %s rendering as before', name => {
    const resolved = resolveThemeColors(getBuiltInTheme(name)!);
    // No optional token is resolved, so the colour map is exactly what it was.
    expect(Object.keys(resolved).sort()).toEqual([...COLOR_TOKENS].sort());
    expect(getBuiltInTheme(name)!.neutralGreys256).toBeUndefined();
    for (const mode of ['truecolor', '256', '16', 'none'] as const) {
      const theme = new Theme(name, resolved, mode);
      expect(theme.getColor('composerBorder')).toBe(resolved.borderAccent);
      expect(theme.getColor('selectionText')).toBe(resolved.accent);
      expect(theme.getColor('selectionBg')).toBe('');
      expect(theme.selected('▸ item')).toBe(theme.fg('accent', '▸ item'));
      expect(theme.fgBg('composerBorder', 'userMessageBg', '▔')).toBe(theme.fgBg('borderAccent', 'userMessageBg', '▔'));
    }
  });

  it('inherit from core tokens in custom themes and Theme instances built from core tokens only', () => {
    const custom = new Theme('mine', resolveThemeColors(validateAndMergeTheme({ colors: { accent: '#123456', borderAccent: '#654321' } }, 'mine')), 'truecolor');
    expect(custom.getColor('selectionText')).toBe('#123456');
    expect(custom.getColor('composerBorder')).toBe('#654321');

    const coreOnly = Object.fromEntries(COLOR_TOKENS.map(token => [token, '#999999'])) as Record<CoreColorToken, string>;
    expect(Object.keys(DERIVED_COLOR_TOKENS).some(token => token in coreOnly)).toBe(false);
    const theme = new Theme('core-only', coreOnly, 'truecolor');
    expect(theme.getColor('composerBorder')).toBe('#999999');
    expect(theme.selected('x')).toBe(theme.fg('accent', 'x'));
  });

  it('can be set by custom themes', () => {
    const custom = resolveThemeColors(validateAndMergeTheme({ colors: { selectionBg: '#ffffff', composerBorder: '#222222' } }, 'mine'));
    expect(custom.selectionBg).toBe('#ffffff');
    expect(custom.composerBorder).toBe('#222222');
  });
});

describe('--set ui.theme=autohand', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fse.mkdtemp(path.join(os.tmpdir(), 'autohand-theme-set-'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    configureRunConfigOverlay(undefined);
    await fse.remove(dir);
  });

  it('selects the autohand theme for the run without saving it', async () => {
    const configPath = path.join(dir, 'config.json');
    await fse.writeJson(configPath, { provider: 'openrouter', openrouter: { apiKey: 'k', model: 'm' }, ui: { theme: 'aurora' } });
    configureRunConfigOverlay({ sets: ['ui.theme=autohand'] });
    const { loadConfig, saveConfig } = await import('../../../src/config.js');
    const { getTheme } = await import('../../../src/ui/theme/index.js');

    const loaded = await loadConfig(configPath);
    expect(loaded.ui?.theme).toBe('autohand');
    expect(getTheme().name).toBe('autohand');
    expect(getTheme().colors.userMessageBg).toBe('#171A1F');

    await saveConfig(loaded);
    expect((await fse.readJson(configPath)).ui.theme).toBe('aurora');
  });
});
