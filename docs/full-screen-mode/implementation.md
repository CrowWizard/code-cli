# Full-screen mode implementation

- [x] Merge completed branch work into local main and create the isolated `full_screen_mode` worktree.
- [x] Define the experimental scope, behavior and design.
- [x] Add failing tests for the registry, terminal ownership, viewport model and rendered frame.
- [x] Implement default-off feature wiring and shared alternate-screen lifecycle.
- [x] Implement bounded transcript rendering, paging, resize anchoring and search.
- [x] Integrate the existing composer, tool expansion and modal flows.
- [x] Document activation, keyboard controls, fallback and limitations in the config reference.
- [x] Validate focused unit/Ink tests, built-CLI Tuistory, lint and build; run full proof and record its result.
- [x] Commit the reviewed implementation on `full_screen_mode`.

## Validation — 2026-10-05

- Related UI/registry regression run: 389 passed, 4 skipped across 25 files. Startup configuration wiring also passed after correcting optional-config handling.
- Lint, type checking and the final ESM/CJS/declaration build passed.
- Final built-CLI Tuistory: 6 passed across the full-screen and existing compact-output scenarios. Covers paging, search, resize, draft editing, nested usage modal, persisted opt-in, expansion/collapse, provider tool-result preservation and exit.
- **Full proof is not green.** Its unit stage finished with 11,726 passed, 15 failed and 49 skipped across 825 files, so its automatic build/Tuistory stage did not run. Build and the focused terminal scenarios above ran separately.
- All nine failed files passed unchanged in a focused rerun (254 tests): `command.spec.ts`, `extensionsCliCommand.spec.ts`, `mcpClientManager.spec.ts`, `actions/command.coordination.test.ts`, `ui/discoveryProgressPty.test.ts`, `ui/inputPrompt.test.ts`, `core/agent/WorkspaceFileCollector.mobile-query.test.ts`, `modes/rpc/blueprintProcess.integration.test.ts`, and `ui/ink/peerComposer.pty.test.ts`. These reruns support intermittent execution failures; they do not replace a passing aggregate proof.

The experiment remains disabled by default. No release or remote push is part of this implementation.

## Interaction repair — 2026-10-06

- Shortcut help now opens above the composer in responsive Compose, Session and Transcript/History columns. It uses the active keybinding profile. Full-screen suggestion menus also open above the input, and the status bar retains its height.
- Hardware cursor coordinates include the measured full-screen footer origin, including after resize and popup layout changes.
- Mouse input respects the existing setting and terminal defaults. The wheel scrolls the transcript; click-to-edit includes the first visible row of a clipped multiline draft.
- `/about`, `/go`, and `/ps` outputs are explicitly marked as preformatted terminal content so Markdown cannot flatten logos, QR quiet zones, or numbered process rows.
- A new rendered shortcut snapshot and built-CLI scenarios cover wide/narrow help placement, cursor position, slash menus, mouse editing, multiline drafts, and `/status` modal return. The isolated `/status` test passes; the user-reported live-provider lockout has not been reproduced and is not claimed fixed.

Validation: 226 related unit/Ink tests passed, followed by 24 command-format/profile tests. Fourteen full-screen/caret Tuistory scenarios passed; the inline profile scenario and four targeted startup/slash/QR/process scenarios passed. The initial broader terminal run had 38 passed and 7 failed: four PTY startup timeouts, QR/process formatting failures corrected above, and a deep-research assertion that did not tolerate terminal word wrapping. The assertion now checks the same message and report path across wrapped whitespace, and the scenario passes. Lint, type checking and build passed. Native Ghostty GUI testing was unavailable; terminal claims are based on real PTYs.

Full proof completed in 13m33s with **11,734 passed, 9 failed, and 49 skipped** (826 files). It stopped in the unit stage, so the automatic whole Tuistory stage did not run. One failure used the old shortcut-history labels; the updated eight-test file passed. The eight failed files then ran in isolation: 185 passed and one command-coordination timing test failed. That final test passed individually both on unchanged main and in this worktree. These reruns do not turn the aggregate proof green. The final shortcut placement/caret check also passed at all three tested widths, and lint/type checking passed after the test expectation updates.
