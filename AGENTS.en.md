# MoonSprite Development Rules

[中文](AGENTS.md) | English

> Human-facing English mirror. AI agents use `AGENTS.md` and the Chinese contracts as their sole routine context. This file is read only for explicit translation, English-document maintenance, bilingual audits, or targeted release synchronization.

The single entry point for daily rules. Detailed release, performance, and recovery procedures live in `docs/agent-workflow.md`; the documentation index is `docs/README.md`. Ordinary tasks read only the Chinese rules and directly related contracts — not English mirrors, historical archives, or unrelated modules.

## Working Boundaries

- Check `git status` once at the start of every new request and preserve the user's existing diffs. The current Agent owns writes by default, and only one writing task is allowed per workspace. Parallel read-only searching, testing, and analysis are fine, as are separate worktrees; no task may overwrite another task's changes.
- Ordinary requests do not create, spawn, or retain sub-agents, and do not write concurrently in the same checkout. Only when the user explicitly requests a whole-project architecture audit or a large cross-module refactor may a single read-only architecture agent be used, and it may not spawn descendants. When the user says "continue", continue only the current task — do not rescan or re-derive.
- Ordinary tasks start on the global `gpt-5.6-terra` + `low`. Do not raise ordinary UI, debug, or review work to `gpt-5.6-sol`/`ultra`; only an explicit user request or a complex architecture task justifies an upgrade. Task-level settings can override the global ones, so start or restart the task after switching.
- Do not set timed "continue" loops, background polling, or blind retries. On 403/429, record it once, then wait for the service to recover or switch to a new lightweight task. If Codex runs low on disk or accumulates too many old rollouts, report it and ask the user to archive — never delete automatically.
- Ordinary requests get one implementation round plus one targeted check by default, and end as soon as the result is acceptable; the default ceiling is 20 tool calls or 30 minutes. If the ceiling is exceeded, report first; do not keep polling because a subtask has not finished. Complex tasks require the user to relax the ceiling explicitly.
- The project is in Beta iteration; the actual version is the consistent value across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Enter the release process, changelog updates, or packaging only when the user explicitly requests a release, release preparation, or an installer.
- Context compaction, a model switch, or resuming after a pause is still the same request. Use the existing summary and read only the missing next-step facts; do not rerun checks because of compaction.

## Risk and Checks

- D0: documentation, copy, CSS — hand it to the user for acceptance.
- D1: ordinary UI, menus, dialogs, and low-frequency interactions — deliver directly by default.
- D2: general Core, Store, Shared, and shortcuts — once stable, run `pnpm check:dev -- <files...>`.
- D3: coordinates, selection, undo, file formats, persistence, platform security, shared core algorithms, and the canvas, project IO, recovery, and decode paths — run `pnpm check:dev -- --risk=high <source-files...> <focused-tests...>`.
- The validation script detects D3 paths automatically. JavaScript/TypeScript D3 must include one real focused test (`.test`, `.spec`, or `.bench`); Rust D3 runs the matching `cargo check` by default, and switches to `cargo test --test` when files under `src-tauri/**/tests/*.rs` are passed explicitly. Do not attach unrelated JavaScript tests.
- `pnpm check:dev` cross-checks its validation scope against the actual git changes: if a changed high-risk file is missing from the passed list, the check fails outright. Do not shrink the scope by under-reporting files.
- The Rust side is bounded by the risk allowances in `scripts/rust-risk-budget.json`. Per-file counts of panic (`.unwrap()` / `.expect(`), silent swallowing (`let _ =`), and `unsafe` may not rise; unregistered files may not introduce counts; and `src-tauri/src` has zero tolerance for `panic!`/`todo!`/`unimplemented!`/`unreachable!`. New Rust platform code must return presentable errors instead of panicking.
- Chinese/English doc pairing is enforced by `scripts/check-doc-pairs.mjs`: every English mirror must match its Chinese source heading-for-heading at each level and link in both directions. Pairs that are not yet synchronized are registered in `scripts/doc-pair-budget.json`, and that registry may only shrink. When an English mirror is dropped, remove the English switch link at the top of the Chinese source as well.
- Performance audits are an expensive entry point: `check:performance` and `check:performance:release` must be given explicit files. Pass `--all` only for an explicit whole-repository audit, and never treat an omitted file list as a full run.
- Ordinary development does not run maintenance gates, the full test suite, the performance matrix, full builds, automated browser acceptance, or desktop regression. When a definite error appears, rerun only the affected checks.
- For very large source files, locate symbols with `rg` first and then read by line range. Do not load all of `CanvasStage.tsx`, `workspace.ts`, or a complete historical log at once.
- Stop the tool loop when there is no new diff, test result, or root-cause evidence. If two consecutive rounds make no progress, report the symptom, your assessment, and the single next step.

## Inviolable Contracts

- Coordinate conversion reuses the shared geometry functions; view pan, zoom, rotation, and panel layout must not enter the document undo history.
- Components may write documents only through Store domain commands or document transactions. They must not directly change `SpriteDocument`, dirty, revision, invalidation, or `HistoryStack`.
- `encodeProject`/`decodeProject` belong only to the file and recovery boundaries and must not be used for undo snapshots. A single open performs one full decode, and async project tasks must not copy the whole document on the UI thread first.
- Save and recovery errors must enter an observable channel; `catch` blocks that silently swallow errors are forbidden.
- `core/` does not depend on React, components, platform, or store; `store/` does not depend back on components; Tauri APIs are reached only from `platform/`; render keys must not serialize pixels or whole documents.
- Architecture rules must still match real source: `guard` uses `expiresAt: permanent`, and `migration` must carry a deadline. When the shape a rule guards disappears, the rule must be retired or replaced — never leave a permanently green rule with zero matches.
- UI reuses the component library and pixel icons first; containers stay square-cornered and the primary action color is `#2979FF`.
- No force-pushing, and no committing generated artifacts, installers, user projects, recovery files, or secrets.

## Commands

```powershell
pnpm check:dev -- <task-files...>
pnpm check:dev -- --risk=high <source-files...> <focused-tests...>
pnpm check:performance:release -- <cycle-files...>
pnpm check:release
```
