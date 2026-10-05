# Full-screen terminal mode

## Problem and outcome

Long conversations and tool output currently share the terminal's scrollback with a dynamic composer. The experimental full-screen mode owns a bounded terminal viewport: history scrolls above a composer that remains visible and editable.

## Activation

- Off by default. Users opt in with `/experiments enable full_screen_mode` or `autohand experiments enable full_screen_mode`.
- Stored as `features.fullScreenMode: true`; enabling or disabling requires restarting the interactive CLI.
- Only interactive TTY input/output with a usable terminal enables the mode. Piped output, RPC, ACP and `TERM=dumb` retain their existing behavior.
- Existing inline mode remains the default and rollback path.

## Required behavior

1. Keep the composer, draft, queue controls and status usable while output streams or grows beyond the terminal height.
2. Render only the visible transcript rows into Ink. Keep the canonical session transcript unchanged.
3. Page Up/Page Down browse history; Ctrl+End returns to the latest output. New output follows the tail only when the user is already at the tail.
4. Preserve the message being read across terminal width changes and modal round trips.
5. Ctrl+F searches rendered transcript text without overwriting the composer draft. Enter advances through matches; Escape leaves search.
6. Support Markdown, links and clickable image labels through the existing terminal formatter. Preserve compact tool previews and explicit expansion.
7. Keep slash-command menus, usage reports, permission prompts, feedback, queues and Ctrl+C behavior working. Restore the original terminal screen on shutdown, failed startup and process exit.
8. Do not enable mouse capture as a side effect of the experiment. Keyboard scrolling is guaranteed; selection/copy uses terminal facilities. Custom selection and mouse scrolling are outside the first experiment.
9. Do not change provider requests, token accounting, permissions, session storage or noninteractive output.

## Acceptance evidence

Tests cover default-off activation, persistence, TTY fallback, screen lifecycle and nested modals; transcript paging, streaming, resize anchoring and search; and built-CLI startup, long output, draft preservation, modal return and clean exit. Run focused tests, lint, build, Tuistory and `bun run proof`. Record aggregate failures separately from focused proof.
