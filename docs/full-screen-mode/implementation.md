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
