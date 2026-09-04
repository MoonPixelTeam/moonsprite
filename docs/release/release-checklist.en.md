# Release Checklist

[中文](release-checklist.md) | English

Run this process only when explicitly asked to release `dev.X` or deliver an installer. Ordinary code changes during continuous development do not automatically enter release gates or packaging.

## Before Release

- [ ] The worktree is clean, and the target commit has been pushed and passed CI.
- [ ] The cycle baseline commit SHA is recorded, and the complete diff since that baseline has been audited.
- [ ] The Unreleased section of `CHANGELOG.md` records every change in this version individually, without deleting or compressing existing valid entries.
- [ ] Release archiving moves only Unreleased entries into `docs/changelog/<version>.md`, keeps entry text complete, and recreates an empty Unreleased section.
- [ ] The version indexes in the root and `docs/changelog/README.md` both link to the new archive.
- [ ] The version and summary shown under Help > Changelog have been updated to this archive rather than continuing to show the previous DEV summary.
- [ ] The version, publication date, and summary shown under Home > News match this archive and open the same complete update as Help > Changelog.
- [ ] Internal SemVer matches across `package.json`, Cargo, and Tauri configuration.
- [ ] The displayed application version, most recently packaged version, and archive index match `docs/release/development-cycle.md`; `pnpm check:version -- --release` passes.
- [ ] Project-file-format changes include migration, compatibility tests, and an ADR.
- [ ] No user projects, recovery files, workspaces, secrets, or installers are committed.
- [ ] This version's performance audit and at most two optimization candidates are complete; `pnpm check:performance:accept` generated a performance release receipt matching the current source.

## Automated Checks

```powershell
pnpm install --frozen-lockfile
pnpm check:performance:release -- <files relevant to this cycle...>
pnpm check:performance:verify -- --audit=<audit-id> --correctness-passed
pnpm check:performance:accept -- --audit=<audit-id> --outcome=<adopted|not-adopted|approved-no-change> --reason=<reason>
pnpm check:release
pnpm check:release -- --desktop # when a real desktop automation gate is required
pnpm package                     # when the user explicitly requests an installer
```

Run one performance audit for every dev.X or stable release; do not run it during ordinary continuous development. `check:release` verifies the performance receipt without rerunning benchmarks.

## Installed-Build Checks

- [ ] Install under a clean user profile; first launch has no blank screen or duplicate dialogs.
- [ ] Built-in examples appear under Recent and Gallery.
- [ ] Double-clicking a `.moonsprite` file opens the project directly.
- [ ] File drag-and-drop, open, save, Save As, and export work normally.
- [ ] File thumbnails, desktop file icons, and Open in Folder work normally.
- [ ] Closing an unsaved project, abnormal recovery, and explicit discard behave correctly.
- [ ] Uninstall removes application files correctly without deleting user projects.

## Delivery

- [ ] Record the installer's absolute path, byte size, and SHA-256.
- [ ] Do not commit `release/` contents to Git.
- [ ] Record the dev release commit SHA as the next cycle baseline.
- [ ] Create an annotated Git tag for stable releases; create a lightweight tag for development builds only when the user needs one.
