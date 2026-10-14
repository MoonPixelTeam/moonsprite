# ADR 0001: Concentrate Verifiable Rules in Core

[中文](0001-core-boundaries.md) | English

## Status

Accepted.

## Context

`App.tsx`, the workspace store, and canvas components had accumulated shortcut, preference, project-format, and history rules over time. Continuing to add logic to these large files would couple user-visible behavior to internal state and force regression tests to launch the complete UI.

## Decision

- Put shortcut rules in `core/shortcuts.ts`.
- Put editor preference defaults, parsing, clamping, and persistence in `core/file-preferences.ts`.
- Keep only document-edit history in the undo stack, with `HistoryStack` enforcing memory-accounting invariants.
- Route every `.moonsprite` manifest through `PROJECT_SCHEMA_VERSION` and `migrateProjectManifest()`.
- React components only render state and dispatch intent; they must not duplicate these rules.

## Consequences

When adding a shortcut, setting, or project field, contributors can test pure functions before connecting the UI. Future format upgrades can add migration branches without rewriting the entire decoder. View and window layouts can still be persisted independently without polluting document undo history.
