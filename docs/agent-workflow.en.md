# AI and Automated Development Workflow

[中文](agent-workflow.md) | English

> Human-facing English mirror. AI agents use `docs/agent-workflow.md` and other Chinese contracts as their sole routine context. Do not load this file during ordinary development.

MoonSprite uses a complete `dev.X` as its development unit. Continuous development and debugging are the default. Release gates are consolidated only after the user confirms the work is complete and explicitly requests a release. There is no intermediate stable batch.

## 1. Starting a Task

1. Check `git status` and distinguish existing uncommitted work from files that will be changed by the current task. Never overwrite, revert, or include unrelated prior changes in the validation scope.
2. AI agents read `AGENTS.md`, `docs/README.md`, and directly related Chinese contracts. D0/D1 work does not load release, performance, historical-audit, ADR, or English-mirror details. During development, do not read archived changelogs or traverse `docs/changelog/` or `docs/archive/` for ordinary tasks.
3. Classify the task using the following risk levels. Ask only when a product decision cannot be inferred from the latest user instruction, current code, and contracts.

| Risk | Typical scope | Minimum development validation |
| --- | --- | --- |
| D0 | Documentation, wording, CSS, visual-only layout | No application check; user acceptance |
| D1 | Ordinary components, menus, dialogs, low-frequency interactions | User acceptance; no application check by default |
| D2 | General Store, shared state, shortcuts, Core/Shared debugging | Type check; explicitly include related tests only when useful |
| D3 | Coordinates, selections, undo, file formats, persistence, platform security, shared core algorithms, recurring or hard-to-detect bugs | `--risk=high` with targeted regression tests; Rust changes also run the matching `cargo check` |

File count does not determine risk. Human judgment may raise the level. Lower it only after confirming the change does not affect high-risk semantics.

## 2. Continuous Development and Debugging

1. Find the root cause and implement the change directly. Do not begin by creating release documents, regression records, or performance records.
2. Keep changes within relevant modules. If a fix must cross modules, explain the dependency first. Leave architecture debt and optional refactors for the release diff audit.
3. After implementation, run at most one round of minimum validation. The default command is:

```powershell
pnpm check:dev -- <files-actually-changed-by-this-task...>
```

Development mode requires an explicit file list. It fails instead of scanning a worktree that may contain unrelated changes. D3 work uses:

```powershell
pnpm check:dev -- --risk=high <source-files...> <focused-test-files...>
```

4. `check:dev` behavior:

- Documentation and maintenance files do not trigger application validation.
- CSS-only changes do not trigger tests.
- TypeScript changes trigger type checking.
- Ordinary Core, Store, and Shared debugging does not require tests merely because of directory location. When tests are listed explicitly, only those tests run; `vitest related` does not expand the scope.
- JavaScript/TypeScript D3 paths must include at least one `.test`, `.spec`, or `.bench` file. Rust D3 paths run the matching `cargo check` and do not require an unrelated JavaScript test.
- Renderer changes receive targeted static import checks only for explicitly listed changed files. Full Renderer boundary scanning runs only for releases, architecture audits, or an explicit `pnpm check:boundaries` call without `--files`.
- Rust and thumbnail changes run only the matching `cargo check`, not an installer build.

5. Add the smallest regression test for D3 bugs, recurring bugs, hard-to-detect bugs, and shared algorithms. Other bugs do not require a failing test first or a regression-matrix entry.
6. Return the implementation for user testing immediately after minimum checks pass. Briefly state the changed area, possible impact, and what the user should inspect. The user is the authority for layout, visual feel, animation feel, and requirement fit.
7. During development, do not automatically run the following unless explicitly requested:

- `pnpm check:release`, `pnpm check:maintenance`, the full test suite, or a complete build.
- Performance classification, benchmarks, or performance-history updates.
- Automated browser interaction, screenshot comparison, or desktop regression.
- Installers, commits, pushes, pull requests, or per-change `CHANGELOG.md` updates.

## 3. Debugging Stop Conditions

- A confirmed compile, test, or runtime error may be fixed and the matching check rerun.
- Without reproducible evidence, do not keep adding speculative tests, automated acceptance, or broader changes.
- If two consecutive change rounds still do not solve the problem, stop guessing and report the confirmed behavior, current root-cause assessment, excluded causes, and required next information.
- Do not start a whole-project refactor because of a local UI issue. If architecture is genuinely blocking progress, explain the cost and benefit first.

## 4. Releasing dev.X

When the user explicitly requests “release dev.X,” “prepare a release,” or “generate a development build”:

1. Confirm the cycle baseline commit SHA and treat the complete diff from that commit through the current worktree as the release scope.
2. Consolidate audits for duplicate implementations, module responsibility, data-format migration, temporary compatibility code, debug code, high-risk regressions, and affected performance-critical areas.
3. Every `dev.X` and formal release begins with one bounded performance audit:

```powershell
pnpm check:performance:release -- <cycle-related-files...>
```

The auditor selects a suite and produces one stable candidate. Low-risk repeated computation, allocation, subscription, and refresh-scope changes in a concrete React area may be attempted automatically. Pixel, coordinate, undo, selection, format, mutable-cache, and architecture-responsibility changes must pause for confirmation. Each candidate gets at most two rounds. After correctness tests, run:

```powershell
pnpm check:performance:verify -- --audit=<audit-id> --correctness-passed
pnpm check:performance:accept -- --audit=<audit-id> --outcome=<adopted|not-adopted|approved-no-change> --reason=<reason>
```

Restore an optimization that does not exceed the noise threshold and accept it as `not-adopted`. For a high-risk candidate the user explicitly approves without code changes, use `approved-no-change --user-approved`. Only the accept command updates the machine baseline, performance history, and release credential.

4. Update the following from the actual diff:

- The Unreleased section of `CHANGELOG.md`, with one entry per independently describable effective change.
- Product, interaction, or architecture contracts whose behavior changed.
- Regression matrix entries and tests for recurring, hard-to-detect, or D3 bugs.
- Current architecture-plan status, without updating unrelated documentation.
- After Chinese documentation is final, synchronize only existing English mirrors for files actually changed in the cycle. Do not read or audit unchanged English documentation.

5. Run the release correctness gate:

```powershell
pnpm check:release
```

This first verifies that the performance release credential matches the current version and source fingerprint, then runs maintenance gates, module boundaries, full frontend types and tests, the Web build, Rust checks, and the thumbnail build. It does not rerun performance benchmarks or create installers.

6. For real desktop behavior that needs automated gating, run `pnpm check:release -- --desktop`. When the user requests an installer deliverable, follow `docs/release/release-checklist.en.md` item by item.
7. After release, record the commit SHA as the baseline for the next `dev.X`. Create a formal tag for a formal release. Create a lightweight development tag only when needed.

## 5. Performance Audits

Ordinary requests and continuous debugging do not run performance tests. Every `dev.X` and formal release runs one audit. Outside release work, run an audit only for:

- A major version or user-designated milestone.
- Dedicated performance work.
- An observed slowdown, long task, or memory anomaly.
- An explicit user request.

When auditing, `pnpm check:performance -- <related-files...>` classifies the scope and selects targeted scenarios. Targeted P3 runs only the lightweight representative suite for the declared files; the complete standard, complex, large-canvas, and desktop matrices run only for a release audit or explicit `--all`. Report, analysis, acceptance, and credential scripts use the fast script-test path and do not trigger Canvas benchmarks. Releases use `pnpm check:performance:release -- <related-files...>` and enforce at least P3, including `128/512/1024` standard canvases, `800/2048/4000` multi-content large canvases, a `1024` complex animation project, and a small React profiling sentinel. Use `pnpm check:performance:receipt` only for the final release-credential check. Production-runtime metrics and React profiling metrics use separate production builds and separate suites. Never update baselines from the Vite development server. Matrix scans discover candidates and enforce absolute budgets; a Canvas regression requires at least three samples from both the current run and the accepted baseline. Each scenario initializes independently, and complex undo prepares and verifies its own history depth. Canvas candidates use the median of three samples; algorithm benchmarks use their own statistical error. Select one candidate at a time for at most two rounds. Only a final accepted result updates the baseline, release credential, and one performance-history entry. The GitHub performance workflow is manual-only, uploads reports, and does not write to the repository.

## 6. Security and Architecture Protection

- `core/` does not depend on React, components, platform, or Store. `store/` does not depend backward on components. Tauri APIs are accessed only through `platform/`.
- Components read state and collect input. They do not directly modify document or session-derived state, call raw `mutateActive` or `pushHistory`, or start, end, or write `HistoryStack`. Document writes and history commits go through domain commands or `begin/update/commit/cancel` transactions. Preview transactions cover confirmation, cancellation, document switching, and unmount cleanup.
- Undo history is independent from the project format. `encodeProject` and `decodeProject` are not history snapshots; history stores the smallest affected-domain delta. View state remains outside document history.
- One open performs one full decode, and initial compositing reuses the result. Async save, recovery, and project tasks must not traverse, copy, or compress the whole document on the UI thread before dispatching a Worker.
- Recovery failures must be reported, logged, or returned. Empty and comment-only `catch` blocks count as silently swallowed errors.
- Production `core/` cycles, a rebuilt giant root `WorkspaceState` in `workspace.ts`, pixel serialization in render keys, and per-file boundary allowlists are prohibited. New commands enter an explicit domain contract in `workspace-state.ts`.
- `check:dev` statically scans only changed files and does not alter historical debt budgets. `pnpm check:boundaries` without `--files` performs full dependency scanning without historical per-file exceptions. `pnpm check:architecture` validates the complete architecture contract. Existing migration debt is represented only by numeric budgets in `scripts/architecture-debt-budget.json`; budgets must equal actual counts, may only decrease, and must reach zero by their deadline.
- Coordinate conversion reuses shared geometry functions. View state does not enter document undo history.
- File-format changes require compatibility, migration, and failure-rollback tests, plus an ADR when needed.
- Do not force-push, overwrite user changes, or commit generated directories, installers, user projects, recovery files, workspaces, or secrets.

## 7. Context Recovery

After context compaction, a model change, or a delayed continuation, use the existing summary and read the Chinese `AGENTS.md` plus only the directly needed contract. Do not reread this English mirror or rescan the repository unless the user explicitly requests English-document maintenance or a new fact is missing.
