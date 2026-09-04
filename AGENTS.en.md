# MoonSprite Development Rules

[中文](AGENTS.md) | English

> Human-facing English mirror. AI agents use `AGENTS.md` and the Chinese documentation as their sole routine context. Do not load this file during ordinary development; it is read only for explicit translation, English-document maintenance, bilingual audits, or targeted release synchronization.

The Chinese `AGENTS.md` is the machine-readable source of truth for all project-level rules. This mirror is maintained for English-speaking human readers and must not cause AI agents to load a second copy of the same rules.

## Default Working State

- The project remains in continuous development for the current `dev.X` by default, until the user explicitly requests “release dev.X,” “prepare a release,” or “generate a development build.” The workflow has only development and release stages, with no intermediate stable batch.
- The commit SHA at the start of the current development cycle is the audit baseline. Release audits cover the cumulative changes after that baseline; ordinary development validates only the files changed by the current task.
- Unless the user explicitly invokes `$moonsprite-code-architect`, the current main Agent must directly handle all ordinary requests, UI changes, debugging, reviews, tests, and release work. Creating, assigning, or retaining sub-agents is prohibited.
- `$moonsprite-code-architect` is used only when the user explicitly requests a whole-project architecture audit, a major milestone architecture review, or planning for a large cross-module refactor. It is read-only by default. Only one architect instance may be created at a time, and that instance may not create or assign descendants. Ordinary requests, UI changes, and continuous debugging must not invoke it automatically or restore per-request agent delegation.
- Ordinary tasks use the configured `gpt-5.6-terra` model at `low` reasoning. Do not raise ordinary UI, debugging, or review work to `gpt-5.6-sol`/`ultra`; reserve that for an explicit request or complex architecture work. Do not run timed “continue” loops or blind retries after a 403/429.

## Change Process

1. First classify the change as visual-only, ordinary interaction, shared state, coordinates and selection, undo, file format, Rust, or platform integration, then choose validation according to risk.
2. Keep changes within the relevant modules. Do not use a local issue as a reason to refactor unrelated code. Record architecture debt for the release audit instead of expanding debugging scope.
3. Automated regression tests and regression-matrix entries are required only for recurring bugs, bugs that are hard to detect manually, shared core algorithms, or changes that may break coordinates, undo, file data, or platform security. Users directly validate ordinary visual, spacing, wording, and simple visibility issues.
4. Development does not require updating `CHANGELOG.md` for every change. When releasing `dev.X`, consolidate the full diff after the cycle baseline while keeping one independent entry for every separately describable effective change, following the [complete changelog policy](docs/release/changelog-policy.en.md).
5. UI state such as view pan, zoom, rotation, and panel layout must not enter document undo history.
6. Coordinate conversion must reuse shared geometry functions. Components must not reimplement rotation, zoom, or offset calculations.
7. Do not force-push or commit generated directories, installers, user projects, recovery files, or secrets.
8. Build installers only when the user explicitly asks for a release or installer.

## During dev.X Development

- Prioritize a user-testable implementation for each request. Run at most one round of the minimum necessary checks, then return it for user testing immediately.
- Run `pnpm check:dev -- <task-files...>` by default. Development mode must receive an explicit file list and may not fall back to scanning the whole worktree. Documentation, wording, CSS, and visual-only layout changes may skip application tests.
- Ordinary TypeScript, including general Core, Store, and Shared debugging, runs only the checks selected by the Chinese policy. Coordinates, selections, undo, file formats, persistence, platform security, shared core algorithms, and recurring or hard-to-detect bugs use `pnpm check:dev -- --risk=high <source-files...> <focused-test-files...>` and run only the explicitly listed tests. Rust and thumbnail code run the corresponding `cargo check`; explicitly listed files under `src-tauri/**/tests/` run the matching `cargo test --test` target.
- The user owns subjective validation of layout, feel, animation, visuals, and requirement fit. Do not run automated browser interaction, screenshot comparison, desktop acceptance, or full builds unless explicitly requested.
- During development, do not run `check:maintenance`, the full test suite, full CI, or performance benchmarks. Do not update release notes, performance history, or the general regression matrix, and do not commit, push, or package every issue.
- Add one `pnpm check:architecture` to the minimum checks only when the task touches component authoring documentation, the undo model, project encoding or decoding, recovery, Core dependencies, or root Store responsibilities. Ordinary UI, wording, and continuous debugging do not run this repository-wide static gate.
- For ordinary D0/D1 work, read only this file, the documentation index, and directly related contracts. Read release, performance, historical audit, and ADR material only when the task requires it.
- A confirmed compile or test error may be fixed and rechecked. Without evidence, do not continue speculative changes. If two consecutive rounds do not solve the issue, report the observed behavior, root-cause assessment, and next step instead of widening the investigation or refactoring.

## Releasing dev.X

- Enter this stage only when the user explicitly requests a release. Run `pnpm check:performance:release` first. Process one candidate at a time for at most two rounds. Low-risk candidates may be attempted automatically; high-risk candidates require confirmation. Restore candidates with no benefit and record them as not adopted.
- Then consolidate the changelog, behavior contracts, architecture status, and required regression matrix updates before running `pnpm check:release`. Run desktop gates and installers only when explicitly needed. Record the completed release SHA as the baseline for the next cycle.
- See `docs/agent-workflow.en.md` and `docs/release/release-checklist.en.md` for the complete release steps. Ordinary development must not load those details.

## Performance Audits

- Ordinary requests and continuous debugging do not run performance benchmarks. Performance work occurs only for releases, dedicated performance work, confirmed regressions, or explicit user requests.
- Each audit handles one stable candidate for at most two rounds, must exceed the noise threshold, and must pass correctness tests. High-risk pixel, coordinate, undo, and format optimizations require confirmation first.
- Read detailed suites, baselines, environment fingerprints, and CI rules only from `docs/agent-workflow.en.md` and `docs/testing/performance-baseline.en.md`. `check:release` must not secretly run benchmarks.

## Reusable UI

- Before creating Renderer UI, inspect `src/renderer/src/components/ComponentLibrary.tsx` and the component-library section of `src/renderer/src/styles.css`.
- Prefer reusing `NumberInput`, `ThemedSelect`, `ColorPicker`, and existing buttons, dialogs, panels, and segmented controls.
- Add every new reusable component to `COMPONENT_LIBRARY_ENTRIES` and provide an interactive preview in `previewRenderers`.
- Previews should cover default, selected, disabled, and interactive states.
- Keep UI containers square-cornered and use `#2979FF` consistently for primary selection and action color.
- The user performs final visual checks at 1024 x 640 and major desktop sizes. Run automated screenshot acceptance only when explicitly requested.

## Module Boundaries

- `core/` contains independently testable pixel, selection, format, and geometry algorithms and does not depend on React.
- `store/` manages document sessions and operations and does not implement view rendering.
- `components/` manages presentation and input and does not duplicate core algorithms.
- `platform/` is the Renderer’s only boundary for accessing Tauri.
- `src-tauri/` owns system files, windows, recovery, clipboard, thumbnails, and packaging integration.
- Do not add unrelated responsibilities to oversized files. Prefer extracting new logic into a clearly owned module with risk-appropriate tests.
- Components must not directly modify `SpriteDocument`, `DocumentSession`, pixels, dirty state, revisions, invalidation, or cache versions. They must not call raw `mutateActive`, `pushHistory`, or directly control `HistoryStack`. All document writes and history commits must go through Store domain commands or `begin/update/commit/cancel` document transactions.
- Live-preview transactions must handle confirmation, cancellation, document switching, and component unmounting. Cancellation restores the baseline; confirmation produces exactly one dirty, history, and invalidation commit.
- `encodeProject` and `decodeProject` belong only to file and recovery boundaries and must not be used as undo snapshots. History stores the minimum before-and-after state for affected domains and does not depend on the project format.
- A project open may perform only one full decode. Initial compositing, thumbnails, and caches must reuse the decoded document. Async save, recovery, and project encoding must not synchronously prepare an entire document before dispatching a Worker.
- Save and recovery failures must enter an observable error channel. Empty `catch` blocks and comment-only `catch` blocks must not silently swallow failures.
- The `core/` production dependency graph must remain acyclic. Render keys may contain only domain revisions and lightweight scalars, never serialized pixels, cel surfaces, or whole documents.
- `WorkspaceState` is composed only from the session, slice, tool, color, view-selection, history, animation, Tilemap, layer, clipboard, project IO, recovery, and UI contracts in `store/workspace-state.ts`. Do not rebuild a giant root interface in `workspace.ts` or add commands that bypass domain contracts.
- `check:dev` performs targeted dependency checks only for changed Renderer files. `pnpm check:boundaries` scans the full Renderer only when called without file arguments. Releases and architecture audits use full scanning and do not use per-file allowlists. `pnpm check:architecture` validates the complete architecture contract. Existing historical debt may be recorded only as numeric budgets in `scripts/architecture-debt-budget.json`; actual counts must equal the budgets, budgets may only decrease, and every budget must reach zero by its deadline.

## Command Entry Points

```powershell
# Continuous development: validate only the current files
pnpm check:dev -- <task-files...>

# High-risk development: run only explicitly listed targeted tests
pnpm check:dev -- --risk=high <source-files...> <focused-test-files...>

# Add only when protected architecture boundaries are touched
pnpm check:architecture

# Check dependency direction only for changed Renderer files (check:dev calls this automatically)
pnpm check:boundaries -- --files <changed-renderer-files...>

# dev.X release: complete correctness and maintenance gate, excluding benchmarks
pnpm check:release

# Version release, milestone, or performance work
pnpm check:performance:release
```
