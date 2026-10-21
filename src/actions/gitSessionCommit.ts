/**
 * @license
 * Copyright 2026 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { executeCoordinatedFile, getCommandCoordination } from '../session/peers/CommandCoordinationGate.js';
import {
  fingerprintGitPath, readGitIndex, readGitStatus, readSnapshotGit, statusEntryPaths,
  type AutoCommitSnapshot,
} from './gitSessionSnapshot.js';
import type { AutoCommitInfo, AutoCommitResult } from './git.js';

export function sessionAutoCommitInfo(cwd: string, snapshot: AutoCommitSnapshot | null): AutoCommitInfo {
  const empty = { canCommit: false, filesChanged: [], filesLeftUncommitted: [], suggestedMessage: '', diffSummary: '' };
  if (!snapshot) return { ...empty, error: 'No session Git baseline; automatic commit disabled' };
  try {
    const root = fs.realpathSync(readSnapshotGit(cwd, ['rev-parse', '--show-toplevel']).trim());
    if (root !== snapshot.repositoryRoot) throw new Error('Session Git baseline belongs to another repository');
    for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
      if (fs.existsSync(path.join(snapshot.gitDirectory, marker))) throw new Error('Finish the existing Git operation before automatic commit');
    }
    const entries = readGitStatus(root).entries;
    const index = readGitIndex(root);
    const filesChanged: string[] = [];
    const filesLeftUncommitted: string[] = [];
    for (const entry of entries) {
      const paths = statusEntryPaths(entry);
      // A rename involving a pre-existing edit belongs entirely to the user.
      if (paths.some(file => snapshot.dirtyPaths.has(file))) {
        filesLeftUncommitted.push(...paths);
      } else {
        for (const file of paths) {
          if (fingerprintGitPath(root, file) !== (snapshot.files.get(file) ?? 'absent')
            || index.get(file) !== snapshot.indexEntries.get(file)) filesChanged.push(file);
        }
      }
    }
    const selected = [...new Set(filesChanged)];
    const diff = selected.length ? spawnSync('git', ['--literal-pathspecs', 'diff', '--stat', 'HEAD', '--', ...selected], { cwd: root, encoding: 'utf8' }) : undefined;
    return {
      canCommit: selected.length > 0,
      error: selected.length ? undefined : 'No changes to commit',
      filesChanged: selected,
      filesLeftUncommitted: [...new Set(filesLeftUncommitted)],
      suggestedMessage: `Update ${selected.length} session file${selected.length === 1 ? '' : 's'}`,
      diffSummary: diff?.stdout?.trim() ?? '',
    };
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : 'Unable to verify session Git state' };
  }
}

async function scopedGit(cwd: string, args: string[], options: Partial<SpawnSyncOptionsWithStringEncoding> = {}): Promise<string> {
  const settings = { ...options, cwd, encoding: 'utf8' as const };
  const result = getCommandCoordination()
    ? await executeCoordinatedFile({ file: 'git', args, cwd }, { input: typeof settings.input === 'string' ? settings.input : undefined, env: settings.env })
    : spawnSync('git', args, settings);
  if (result.status !== 0) throw new Error(result.stderr?.trim() || result.error?.message || 'Git command failed');
  return result.stdout;
}

/** Commit through a private index; unrelated staging and working files stay intact. */
export async function commitSessionChanges(
  cwd: string, message: string, stageAll: boolean, snapshot: AutoCommitSnapshot | null,
  approvedPaths?: readonly string[],
): Promise<AutoCommitResult> {
  const info = sessionAutoCommitInfo(cwd, snapshot);
  if (!info.canCommit || !snapshot) return { success: false, message: info.error ?? 'Cannot commit', filesChanged: 0 };
  const selected = approvedPaths ? info.filesChanged.filter(file => approvedPaths.includes(file)) : info.filesChanged;
  if (!selected.length) return { success: false, message: 'No approved session changes to commit', filesChanged: 0 };
  const root = snapshot.repositoryRoot;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'autohand-commit-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(directory, 'index') };
  const paths = selected.join('\0') + '\0';
  let commitHash: string | undefined;
  try {
    const hasHead = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' }).status === 0;
    await scopedGit(root, ['read-tree', ...(hasHead ? ['HEAD'] : ['--empty'])], { env });
    if (stageAll) {
      await scopedGit(root, ['--literal-pathspecs', 'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { env, input: paths });
    } else {
      const index = readGitIndex(root);
      const algorithm = readSnapshotGit(root, ['rev-parse', '--show-object-format']).trim();
      const zero = '0'.repeat(algorithm === 'sha256' ? 64 : 40);
      const records = selected.map(file => {
        const entry = index.get(file);
        if (!entry) return `0 ${zero}\t${file}\0`;
        const stages = entry.trimEnd().split('\n');
        if (stages.length !== 1 || !stages[0].endsWith(' 0')) throw new Error('Unmerged session path: ' + file);
        return `${stages[0]}\t${file}\0`;
      }).join('');
      await scopedGit(root, ['update-index', '-z', '--index-info'], { env, input: records });
    }
    const staged = (await scopedGit(root, ['diff', '--cached', '--name-only', '-z'], { env })).split('\0').filter(Boolean);
    if (!staged.length) throw new Error('No staged session changes to commit');
    if (staged.some(file => !selected.includes(file))) throw new Error('Automatic commit contains a path outside the session');
    await scopedGit(root, ['commit', '-m', message], { env });
    commitHash = (await scopedGit(root, ['rev-parse', '--short', 'HEAD'])).trim();
    // Refresh only the committed paths in the real index; never reset the user's index.
    await scopedGit(root, ['--literal-pathspecs', 'reset', '-q', 'HEAD', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: paths });
    return { success: true, message: `Committed ${staged.length} file(s): ${commitHash}`, filesChanged: staged.length, commitHash };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Automatic commit failed';
    return commitHash
      ? { success: true, message: `Committed ${commitHash}; could not refresh session index entries: ${detail}`, commitHash, filesChanged: selected.length }
      : { success: false, message: detail, filesChanged: 0 };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

export async function stageSessionPaths(cwd: string, paths: string[], snapshot: AutoCommitSnapshot | null, approved: readonly string[]): Promise<string> {
  const info = sessionAutoCommitInfo(cwd, snapshot);
  if (!info.canCommit || !snapshot) throw new Error(info.error ?? 'Cannot stage session changes');
  const root = snapshot.repositoryRoot;
  const literal = paths.map(file => path.relative(root, path.resolve(fs.realpathSync(cwd), file)).split(path.sep).join('/'));
  if (!literal.length || literal.some(file => !approved.includes(file) || !info.filesChanged.includes(file))) {
    throw new Error('Automatic commit can stage only its listed session files; use exact literal paths');
  }
  const indexed = readGitIndex(root);
  const needed = literal.filter(file => indexed.has(file) || fs.existsSync(path.join(root, file)));
  if (needed.length) await scopedGit(root, ['--literal-pathspecs', 'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: needed.join('\0') + '\0' });
  return `Staged ${literal.length} session file(s)`;
}
