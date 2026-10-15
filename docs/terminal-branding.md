# Terminal branding

The sign-in screen uses a reusable animated Ink brand component. A returning authenticated launch shows a static welcome header using the same generated artwork and monochrome formatter. Selecting Login completes the startup presentation; successful authentication continues into the app without replaying the logo.

The mark is generated from the eight rings and eight centres in `assets/autohand-mark.svg`, a copy of the original Autohand SVG. `scripts/generate-autohand-logo.ts` fits monospaced ring outlines to the SVG layout and precomputes 48 motion frames in `src/utils/autohandLogoData.ts`. Startup selects a canvas that fits the current columns and header rows, capped at 32×10 cells even in a large terminal. Smaller layouts use 24×8 or 24×6 cells. Generation happens before launch; the interactive renderer only selects a frame. Printable ASCII works without terminal image protocols, a special font, or extra dependencies.

The returning-user welcome gives interactive sessions a concise task hint. Before printing the mark, startup reserves space for the actual welcome, workspace notices, cached announcements, and wrapped composer footer. This keeps the full mark visible at standard 80×24 and 120×32 sizes; additional notices or smaller terminals reduce the mark to fit. Command-mode guidance retains its detailed command suggestions.

The logo floats gently while a point and short trail orbit it. The 48 frames advance every 125 ms: 8 frames per second and a six-second loop. The canvas, wordmark, version, login choices, and help remain stationary. The mark inherits a single dimmed terminal foreground, keeping it readable on dark and light backgrounds. Ink owns painting and keyboard input; the brand releases its interval and resize listener on unmount. The menu calculates its wrapped body height before giving the header its row budget, so shrinking the terminal preserves the sign-in options and keyboard guidance. Short terminals progressively use a smaller mark, then the wordmark.

The startup input fallback is released once Ink attaches its input effects. Ink then parses normal and application-mode arrows, including split input sequences. Navigation and selection share a synchronous cursor reference so an arrow and Enter arriving together select the visible choice.

## Capabilities and accessibility

The renderer uses the existing terminal capability detector. `NO_COLOR`, `FORCE_COLOR=0`, non-TTY output, and `TERM=dumb` use a plain still frame. Set `AUTOHAND_REDUCED_MOTION=1` for a still frame without an animation timer. The renderer leaves the terminal background and colour table alone.

[Ghostty's terminfo](https://github.com/ghostty-org/ghostty/blob/main/src/terminfo/ghostty.zig) declares truecolour support and RGB foreground/background capabilities. [iTerm2 documents 256 and 24-bit colour support](https://iterm2.com/documentation-one-page.html#high-color-modes). [Microsoft documents the RGB and indexed ANSI sequences](https://learn.microsoft.com/en-us/windows/console/console-virtual-terminal-sequences#extended-colors) used by modern Windows terminal infrastructure. These are compatibility sources; native application verification remains a separate check.

## ascii.rest decision

[ascii.rest's SVG kit](https://ascii.rest/docs/kit-vector/) brings named SVG parts to life with motions such as bobbing, flipping, and tracing. The startup mark follows that approach with a bobbing logo and an orbiting point, using precomputed frames of its known circle geometry. Its [terminal player](https://ascii.rest/docs/terminal/) owns the alternate screen, cursor, and input; Ink already owns those resources in Autohand, so the integration stays within Ink.

## Reproduce visual evidence

Run from the repository root:

```sh
node --import tsx src/testing/scenarios/captureStartupBranding.ts
node --import tsx src/testing/scenarios/captureStartupBranding.ts --returning-only
```

The utility launches the startup branding scenario in a PTY, polls the terminal buffer without waiting for idle, checks that two phases move the mark while retaining the identity and menu, and resizes to 32×18 and 32×12. It checks clean exit, cursor restoration, and absence of scrollback-clearing sequences. Captured terminal data and dark/light PNG previews are written to `.artifacts/startup-branding/`. Each dark/light pair uses identical PTY cells and colours.

The returning-only command launches the built CLI with temporary authenticated config and local mock servers. It captures the 80×24 and 120×32 viewports after editing the composer, asserts that every logo row remains visible and was printed once, and checks clean exit and cursor restoration. `returning-report.json` identifies the exact built entry point by SHA-256. Default composer colours remain those emitted by the existing application; the light preview also exposes its current explicit dark input background.

`report.json` records three seconds of actual animation output in bytes and PTY chunks per second, plus an isolated frame selection and formatting benchmark. PTY chunks may combine or split process writes. These measurements exclude startup and resize output. The PNGs are terminal-emulator previews, not screenshots of native Ghostty, iTerm2, or Windows Terminal; the report labels all three native applications unverified.

Component tests cover rendering and timer cleanup. Tuistory covers terminal colour profiles, keyboard selection, reduced motion, monochrome output, cursor restoration, and resizing. Full validation remains tests, lint, and `bun run proof`.
