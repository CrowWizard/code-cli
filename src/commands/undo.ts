/**
 * @license
 * Copyright 2025 Autohand AI LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import chalk from 'chalk';
import type { FileMutationTurn } from '../actions/filesystem.js';

export interface UndoCommandContext {
    getLastTurn: () => FileMutationTurn | undefined;
    undoTurnMutations: (turn: FileMutationTurn) => Promise<string[]>;
    removeLastTurn: (turnId: string) => boolean;
}

export async function undo(ctx: UndoCommandContext): Promise<string | null> {
    const turn = ctx.getLastTurn();
    if (!turn) {
        console.log(chalk.gray('No conversation turn to undo.'));
        return null;
    }
    console.log();
    console.log(chalk.bold.yellow('Undoing changes...'));
    if (turn.ranShellCommand) console.log(chalk.yellow('Shell command changes are not undone.'));
    try {
        const files = await ctx.undoTurnMutations(turn);
        if (!ctx.removeLastTurn(turn.id)) {
            console.log(chalk.yellow('The conversation changed during undo; kept its turns.'));
            return null;
        }
        console.log(chalk.green(files.length > 0
            ? 'Restored ' + files.length + ' files: ' + files.join(', ')
            : 'No file changes in the last turn; removed it from the conversation.'));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(chalk.yellow('Undo stopped: ' + message + '. Kept the last conversation turn.'));
        return null;
    }
    console.log();
    console.log(chalk.cyan('Undo complete. Ready for new instructions.'));
    return null;
}

export const metadata = {
    command: '/undo',
    description: 'revert agent file edits from the last turn and remove that turn',
    implemented: true
};
