import { detectColorMode } from './theme/Theme.js';
import type { ColorMode } from './theme/types.js';
import { AUTOHAND_LOGO_FRAME_COUNT } from '../utils/autohandLogoData.js';

export const BRAND_FRAME_INTERVAL_MS = 125;
export const BRAND_FRAME_COUNT = AUTOHAND_LOGO_FRAME_COUNT;

export function resolveBrandColorMode(isTTY: boolean): ColorMode {
  if (!isTTY || process.env.TERM === 'dumb') return 'none';
  return detectColorMode();
}

export function shouldAnimateBrand(isTTY: boolean, colorMode: ColorMode, animate = true): boolean {
  return animate && isTTY && colorMode !== 'none' && process.env.AUTOHAND_REDUCED_MOTION !== '1';
}

export function formatBrandLogo(art: string, _frame = 0, colorMode: ColorMode = resolveBrandColorMode(Boolean(process.stdout.isTTY))): string {
  if (colorMode === 'none') return art;
  return art.split('\n').map(line => `\x1b[2m${line}\x1b[22m`).join('\n');
}
