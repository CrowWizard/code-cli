/** @license Apache-2.0 */
import React, { useMemo, useRef } from 'react';
import { Box, Text, useBoxMetrics, type DOMElement } from 'ink';
import type { ChatLogMessage } from '../../session/chatLog.js';
import { useTheme } from '../theme/ThemeContext.js';
import type { FullScreenTranscript } from './fullScreenTranscript.js';

interface FullScreenFrameProps {
  model: FullScreenTranscript;
  messages: readonly ChatLogMessage[];
  footer: React.ReactNode;
  detailsId?: string;
  rows: number;
  columns: number;
}

export function FullScreenFrame({ model, messages, footer, rows, columns, detailsId }: FullScreenFrameProps) {
  const { colors } = useTheme();
  const footerRef = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(footerRef);
  const height = Math.max(1, rows - 1);
  const width = Math.max(1, columns - 1);
  const footerLimit = Math.max(1, height - 3);
  const footerHeight = Math.min(footerLimit, metrics.hasMeasured ? metrics.height : 8);
  const bodyHeight = Math.max(0, height - footerHeight - 1);
  useMemo(() => model.update(messages, width), [model, messages, width]);
  model.focusDetails(detailsId);
  const view = model.view(Math.max(1, bodyHeight));
  const lines = view.lines.slice(0, bodyHeight);
  while (lines.length < bodyHeight) lines.push(' ');
  const hint = model.searchQuery !== null
    ? `Find: ${model.searchQuery} · Enter next · Esc close${model.searchMatched ? '' : ' · No match'}`
    : `Full screen · ${view.following ? 'Latest' : 'Ctrl+End latest'} · PgUp/PgDn · Ctrl+F find`;
  return <Box flexDirection="column" width={width} height={height} overflow="hidden">
    <Text color={colors.muted} wrap="truncate">{hint}</Text>
    <Box flexDirection="column" height={bodyHeight} flexShrink={0} overflow="hidden">
      {lines.map((line, index) => <Text key={index} wrap="truncate">{line || ' '}</Text>)}
    </Box>
    <Box ref={footerRef} flexDirection="column" flexShrink={0} maxHeight={footerLimit} overflow="hidden" justifyContent="flex-end">{footer}</Box>
  </Box>;
}
