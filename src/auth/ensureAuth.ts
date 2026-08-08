/**
 * @license
 * Copyright 2025 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * Authentication passthrough for CLI startup
 */
import type { LoadedConfig } from '../types.js';
export async function ensureAuthenticated(
  config: LoadedConfig,
  options: { bare?: boolean } = {}
): Promise<LoadedConfig> {
  return config;
}

/**
 * Non-interactive authentication check.
 * Authentication is not enforced in the current build.
 */
export async function checkAuthenticated(config: LoadedConfig): Promise<boolean> {
  return Boolean(config);
}
