/**
 * @license
 * Copyright 2025 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationManager } from '../src/core/conversationManager.js';

describe('ConversationManager', () => {
  it('keeps histories isolated between agent instances', () => {
    const firstSession = new ConversationManager();
    const secondSession = new ConversationManager();

    firstSession.reset('first system prompt');
    secondSession.reset('second system prompt');
    firstSession.addMessage({ role: 'user', content: 'first session context' });

    expect(firstSession.history()).toContainEqual({ role: 'user', content: 'first session context' });
    expect(secondSession.history()).toEqual([{ role: 'system', content: 'second system prompt' }]);
  });

  beforeEach(() => {
    const manager = ConversationManager.getInstance();
    manager.reset('system message');
  });

  it('behaves as a singleton', () => {
    const first = ConversationManager.getInstance();
    const second = ConversationManager.getInstance();
    expect(first).toBe(second);
  });

  it('maintains history with the system prompt and user messages', () => {
    const manager = ConversationManager.getInstance();
    manager.addMessage({ role: 'user', content: 'Hello' });
    const history = manager.history();
    expect(history[0].role).toBe('system');
    expect(history[1]).toEqual({ role: 'user', content: 'Hello' });
  });
});
