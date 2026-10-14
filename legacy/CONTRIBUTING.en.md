# Contributing to MoonSprite

[中文](CONTRIBUTING.md) | English

MoonSprite is an original implementation. Do not submit source code, icons, themes, or protected assets copied from Aseprite or any other project.

## Contribution License

Unless a separate written agreement applies, by submitting a contribution you represent that you have the right to provide it and agree that it will be distributed under the repository's current MoonSprite Source-Available License 1.0. You also grant the MoonSprite copyright holders a perpetual, worldwide, non-exclusive, royalty-free right to use, modify, distribute, and sell official commercial binaries that include the contribution. You retain copyright in your own contribution.

## Development Process

1. Create a short-lived branch from `main` using the `feature/`, `fix/`, `refactor/`, or `docs/` prefix.
2. Read `AGENTS.en.md`, `docs/README.en.md`, and the contracts related to the task.
3. Write a specification before a feature, and reproduction steps plus a regression test before a bug fix.
4. Keep each commit focused and do not mix in unrelated formatting or refactoring.
5. Keep affected behavior contracts current during development. Only when explicitly preparing a release, follow `docs/release/changelog-policy.md` and collect the full cycle diff in `CHANGELOG.md`, preserving published entries.
6. Complete the required checks before opening a pull request.

## Definition of Done

- Behavior matches the relevant contract.
- Bugs have automated regression coverage, and pixel algorithms use deterministic data assertions.
- UI work reuses the component library where possible and covers default, selected, disabled, and interactive states.
- View state is not written into document history, and coordinate conversion is not duplicated.
- Complete the checks required by the D0-D3 levels in `AGENTS.md`. D2/D3 use `pnpm check:dev` with the changed-file list; D3 also requires a real focused test. Full checks, complete builds, and desktop regression belong to the relevant audit or release workflow.
- Affected contracts are synchronized. During release preparation, record each feature, fix, interaction, performance change, refactor, dependency, build change, and platform change from the complete development cycle in `CHANGELOG.md`.

## Commit Format

Use Conventional Commits, for example:

```text
fix: keep selection aligned after rotating the view
feat: add project workspace export
docs: define brush alignment behavior
test: cover layer duplicate undo
```

Never force-push `main`. Keep dependency upgrades in separate commits and explain why each upgrade is needed and how it was validated.
