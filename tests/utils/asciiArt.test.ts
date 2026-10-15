/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
import {
  ASCII_FRIEND,
  LOGO_LINES,
  getTerminalColumns,
  renderAutohandLogo,
} from '../../src/utils/asciiArt.js';

function logoLineWidths(logo: string): number[] {
  return logo.split('\n').map((line) => stringWidth(line));
}

describe('responsive Autohand ASCII logo', () => {
  it('animates SVG geometry within a compact, fixed canvas', () => {
    const first = renderAutohandLogo({ columns: 120, rows: 30, frame: 0 });
    const next = renderAutohandLogo({ columns: 120, rows: 30, frame: 12 });
    expect(next).not.toBe(first);
    expect(first.split('\n')).toHaveLength(10);
    expect(next.split('\n')).toHaveLength(10);
    expect(Math.max(...logoLineWidths(first))).toBeLessThanOrEqual(32);
    expect(Math.max(...logoLineWidths(next))).toBeLessThanOrEqual(32);
  });

  it('wraps every motion phase and retains all eight centres without growing the canvas', () => {
    for (const size of [{ columns: 32, rows: 10 }, { columns: 24, rows: 8 }, { columns: 24, rows: 6 }]) {
      for (let frame = 0; frame < 48; frame++) {
        const art = renderAutohandLogo({ ...size, frame });
        expect(art.split('\n')).toHaveLength(size.rows);
        expect(logoLineWidths(art).every(width => width === size.columns)).toBe(true);
        expect(art.match(/o/g)).toHaveLength(8);
        expect(renderAutohandLogo({ ...size, frame: frame + 48 })).toBe(art);
      }
    }
    expect(renderAutohandLogo({ frame: -1 })).toBe(renderAutohandLogo({ frame: 47 }));
    expect(renderAutohandLogo({ frame: Number.NaN })).toBe(ASCII_FRIEND);
    expect(renderAutohandLogo({ frame: Number.POSITIVE_INFINITY })).toBe(ASCII_FRIEND);
  });
  it.each([
    { columns: 80, expectedColumns: 32, expectedRows: 10 },
    { columns: 56, expectedColumns: 32, expectedRows: 10 },
    { columns: 40, expectedColumns: 32, expectedRows: 10 },
    { columns: 32, expectedColumns: 32, expectedRows: 10 },
    { columns: 31, expectedColumns: 24, expectedRows: 8 },
    { columns: 24, expectedColumns: 24, expectedRows: 8 },
  ])('selects a faithful mark that fits $columns columns', ({ columns, expectedColumns, expectedRows }) => {
    const logo = renderAutohandLogo({ columns });

    expect(Math.max(...logoLineWidths(logo))).toBe(expectedColumns);
    expect(logo.split('\n')).toHaveLength(expectedRows);
    expect(logo).toMatch(/^[ ()o_*\.\-\n]+$/);
  });

  it('retains four ring outlines and separate center disks in each row of the wide mark', () => {
    const lines = renderAutohandLogo({ columns: 56 }).split('\n');

    expect(lines[3].match(/\( o \)/g)).toHaveLength(4);
    expect(lines[6].match(/\( o \)/g)).toHaveLength(4);
    expect(lines.join('').match(/o/g)).toHaveLength(8);
  });

  it.each([
    { columns: 23, expected: 'autohand' },
    { columns: 12, expected: 'autohand' },
    { columns: 8, expected: 'autohand' },
    { columns: 7, expected: 'ah' },
    { columns: 2, expected: 'ah' },
    { columns: 1, expected: 'a' },
    { columns: 0, expected: 'a' },
    { columns: -10, expected: 'a' },
    { columns: 1.9, expected: 'a' },
  ])('uses a fitting text fallback at $columns columns', ({ columns, expected }) => {
    expect(renderAutohandLogo({ columns })).toBe(expected);
  });

  it('uses the same mark and a simple wordmark on wide terminals', () => {
    const logo = renderAutohandLogo({ columns: 140, includeWordmark: true });

    expect(logo).toBe(`${ASCII_FRIEND}\n\n${' '.repeat(12)}autohand`);
    expect(LOGO_LINES.join('\n')).toBe(logo);
    expect(logo.split('\n')).toHaveLength(12);
    expect(logoLineWidths(logo).every((width) => width <= 140)).toBe(true);
  });

  it.each([
    { rows: 14, expectedRows: 10, expectedColumns: 32 },
    { rows: 10, expectedRows: 10, expectedColumns: 32 },
    { rows: 9, expectedRows: 8, expectedColumns: 24 },
    { rows: 7, expectedRows: 6, expectedColumns: 24 },
    { rows: 5, expectedRows: 1, expectedColumns: 8 },
    { rows: 1, expectedRows: 1, expectedColumns: 8 },
  ])('fits the available $rows logo rows', ({ rows, expectedRows, expectedColumns }) => {
    const logo = renderAutohandLogo({ columns: 80, rows });

    expect(logo.split('\n')).toHaveLength(expectedRows);
    expect(Math.max(...logoLineWidths(logo))).toBe(expectedColumns);
  });

  it.each([0, -1, 0.9])('omits the mark when no complete logo row fits: %s', (rows) => {
    expect(renderAutohandLogo({ columns: 80, rows })).toBe('');
  });

  it('includes the wordmark in the available height budget', () => {
    const logo = renderAutohandLogo({ columns: 80, rows: 14, includeWordmark: true });

    expect(logo.split('\n')).toHaveLength(12);
    expect(Math.max(...logoLineWidths(logo))).toBe(32);
    expect(logo.split('\n').at(-1)).toBe(`${' '.repeat(12)}autohand`);
  });

  it('never exceeds constrained columns or rows during terminal resizing', () => {
    for (let columns = 1; columns <= 140; columns++) {
      for (let rows = 1; rows <= 20; rows++) {
        for (const includeWordmark of [false, true]) {
          const logo = renderAutohandLogo({ columns, rows, includeWordmark });

          expect(logoLineWidths(logo).every((width) => width <= columns)).toBe(true);
          expect(logo.split('\n').length).toBeLessThanOrEqual(rows);
        }
      }
    }
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY])('uses safe dimensions for an unavailable terminal size: %s', (dimension) => {
    expect(renderAutohandLogo({ columns: dimension, rows: dimension })).toBe(ASCII_FRIEND);
    expect(getTerminalColumns({ columns: dimension })).toBe(80);
  });

  it('reads terminal width from the output stream when available', () => {
    const output = { columns: 44 };

    expect(getTerminalColumns(output)).toBe(44);
  });
});
