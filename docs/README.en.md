# MoonSprite Documentation Index

[中文](README.md) | English

> Human-facing English mirror. AI agents use `docs/README.md` and the Chinese contracts as their sole routine documentation context. Do not load this index during ordinary development.

This is the English mirror of the project's documentation index. The Chinese index is the canonical entry point for routine development. When code and documentation disagree, confirm the current implementation and tests first, then update the Chinese contract and its English mirror together.

## Product and Architecture

- [Product behavior contract](product/behavior.en.md): user-visible capabilities and stable rules.
- [UI design system](ui-design-system.en.md): colors, typography, spacing, control density, pixel icons, and component reuse.
- [Architecture overview](architecture/overview.en.md): module responsibilities and dependency direction.
- [State and history](architecture/state-history.en.md): sessions, dirty state, undo, and view state.
- [Coordinates and rendering](architecture/coordinates-rendering.en.md): screen, view, canvas, and layer coordinates.
- [Localization architecture](architecture/localization.en.md): language resources, fallback, persistence, and adding-language gates.
- [File format](file-format.en.md): the `.moonsprite` v20 container.

## Interaction Contracts

- [Pointer and modifier keys](interactions/pointer-modifiers.en.md)
- [Selections and transforms](interactions/selection-transform.en.md)
- [Brushes and color](interactions/brush-color.en.md)
- [Workspace and docking](interactions/workspace-docking.en.md)

## Script Development

- [Lua scripting and MSE API](scripting/README.en.md)
- [.msext extension development](extensions/README.en.md): package layout, manifest fields, contributions, limits, and lifecycle.
- See the [extension package ADR](adr/0020-extension-package-format.en.md) for `.msext` package format and installation behavior.
- See [Extension Runtime v1](extensions/runtime-api.en.md) for resident extension permissions, events, and host APIs.

## Quality and Release

- [Regression matrix](testing/regression-matrix.md) (Chinese; maintainer-facing)
- [Performance baseline](testing/performance-baseline.md) (Chinese; maintainer-facing)
- [Performance history](testing/performance-history.md) (Chinese; canonical audit ledger)
- [Complete changelog policy](release/changelog-policy.md) (Chinese; maintainer-facing)
- [Development version cycle](release/development-cycle.md) (Chinese; current maintainer state)
- [Historical changelog archive](changelog/README.md) (Chinese release archive)
- [Release checklist](release/release-checklist.md) (Chinese; maintainer-facing)
- [Architecture decision records](adr/README.en.md)

Daily agent rules, risk tiers, and command entry points live in [AGENTS.md](../AGENTS.md); release, performance, and context-recovery procedures live in [the development workflow](agent-workflow.md), which is maintained in Chinese only. Read other documents only when a task touches them, and move outdated material into `archive/`.
