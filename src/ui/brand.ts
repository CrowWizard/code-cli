import { detectColorMode } from './theme/Theme.js';
import type { ColorMode } from './theme/types.js';
import { AUTOHAND_LOGO_FRAME_COUNT, AUTOHAND_LOGO_FPS } from '../utils/autohandLogoData.js';

export const BRAND_FRAME_INTERVAL_MS = 1_000 / AUTOHAND_LOGO_FPS;
export const BRAND_FRAME_COUNT = AUTOHAND_LOGO_FRAME_COUNT;

export function resolveBrandColorMode(isTTY: boolean): ColorMode {
  if (!isTTY || process.env.TERM === 'dumb') return 'none';
  return detectColorMode();
}

export function shouldAnimateBrand(isTTY: boolean, _colorMode: ColorMode, animate = true): boolean {
  return animate && isTTY && process.env.TERM !== 'dumb' && process.env.AUTOHAND_REDUCED_MOTION !== '1';
}

export function formatBrandLogo(art: string, frame = 0, colorMode: ColorMode = resolveBrandColorMode(Boolean(process.stdout.isTTY))): string {
  if (colorMode === 'none') return art;
  const phase = ((Number.isFinite(frame) ? frame : 0) % BRAND_FRAME_COUNT) / BRAND_FRAME_COUNT * Math.PI * 2;
  return art.split('\n').map((line, row) => {
    let current = -1;
    let output = '';
    for (let column = 0; column < line.length; column++) {
      const glyph = line[column];
      const light = Math.cos(column * 0.14 - row * 0.28 - phase * 2);
      const intensity = glyph === '.' || glyph === '·' || glyph === ' ' ? 2 : light > 0.65 ? 1 : light < -0.45 ? 2 : 22;
      if (intensity !== current) {
        output += `\x1b[22m${intensity === 22 ? '' : `\x1b[${intensity}m`}`;
        current = intensity;
      }
      output += glyph;
    }
    return `${output}\x1b[22m`;
  }).join('\n');
}
