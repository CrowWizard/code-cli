/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../assets/autohand-mark.svg', import.meta.url), 'utf8');
const frameCount = 48;
const circles = [...source.matchAll(/<circle\b([^>]+)\/>/gu)].map((match) => {
  const attribute = (name: string) => Number(new RegExp(`${name}="([^"]+)"`, 'u').exec(match[1])?.[1]);
  return { x: attribute('cx'), y: attribute('cy'), radius: attribute('r'), filled: /\bfill=/u.test(match[1]) };
});
const rings = circles.filter(circle => !circle.filled);
const centers = circles.filter(circle => circle.filled);
if (rings.length !== 8 || centers.length !== 8) throw new Error('The Autohand mark must contain eight rings and eight centers.');

function generateArt(columns: number, rows: number, frame: number): string[] {
  const phase = frame / frameCount * Math.PI * 2;
  const marginY = rows <= 6 ? 1 : 2;
  const scale = Math.min((columns - 6) / 236, (rows - marginY * 2) * 2 / 118);
  const originX = (columns - 236 * scale) / 2;
  const originY = marginY + (rows - marginY * 2 - 118 * scale / 2) / 2;
  const bob = rows > 6 ? Math.round(Math.sin(phase) * 0.65) : 0;
  const lines = Array.from({ length: rows }, () => ' '.repeat(columns));
  const put = (column: number, row: number, glyph: string): void => {
    if (row < 0 || row >= rows || column < 0 || column >= columns) return;
    lines[row] = `${lines[row].slice(0, column)}${glyph}${lines[row].slice(column + 1)}`;
  };
  const outline = columns >= 32 ? [' ___ ', '( o )', ' --- '] : [' _ ', '(o)', ' - '];
  for (const center of centers) {
    const column = Math.floor(originX + center.x * scale);
    const row = Math.floor(originY + (center.y + 2.5) * scale / 2) + bob;
    outline.forEach((line, y) => [...line].forEach((glyph, x) => {
      if (glyph !== ' ') put(column + x - Math.floor(line.length / 2), row + y - 1, glyph);
    }));
  }
  const logo = lines.slice();
  for (const [offset, glyph] of [[-0.22, '.'], [-0.11, '.'], [0, '*']] as const) {
    const angle = phase + offset;
    const column = Math.round((columns - 1) / 2 + Math.cos(angle) * (columns / 2 - 1));
    const row = Math.round((rows - 1) / 2 + Math.sin(angle) * (rows / 2 - 0.6));
    if (logo[row][column] === ' ') put(column, row, glyph);
  }
  return lines;
}

const sizes = [
  { columns: 32, rows: 10 },
  { columns: 24, rows: 8 },
  { columns: 24, rows: 6 },
];
const variants = [];
for (const { columns, rows } of sizes) {
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) frames.push(generateArt(columns, rows, frame));
  variants.push({ columns, lines: frames[0], frames });
}
const output = `/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generated from assets/autohand-mark.svg with 2:1 terminal cells.
 * Regenerate with: bun scripts/generate-autohand-logo.ts
 */
export const AUTOHAND_LOGO_FRAME_COUNT = ${frameCount};
export const AUTOHAND_LOGO_ART = ${JSON.stringify(variants, null, 2)} as const;
`;
await writeFile(new URL('../src/utils/autohandLogoData.ts', import.meta.url), output);
