# ADR-0009: Editable Text Style Runs

[中文](0009-editable-text-style-runs.zh-CN.md) | English

## Status

Accepted

## Context

Editable text needs different sizes, spacing, and colors inside one cel while remaining editable after save and reopen. Raster-only formatting would lose the source selection ranges and could not be reapplied after content edits.

## Decision

- Project schema v8 stores optional ordered, non-overlapping `styleRuns` on each editable text cel.
- Each run uses UTF-16 text offsets and may override font size, line spacing, letter spacing, and RGBA color. Unspecified properties inherit the cel defaults.
- Text edits reconcile runs around the changed range. Rendering resolves each character's effective style before glyph rasterization.
- Actual spacing uses final visible alpha bounds horizontally and vertically. Zero spacing places adjacent visible glyph or line pixels directly next to each other.
- Schema v7 text migrates without synthetic runs and therefore preserves its original whole-text formatting.

## Consequences

Mixed formatting remains editable and round-trips with the project. Character-level glyph rasterization costs more than one `fillText` call per line, so glyph alpha results are cached within each rasterization pass. Font family and antialias mode remain cel-wide properties.

## Alternatives

Embedding markup in the text string was rejected because it would corrupt selection offsets and copied text. Saving only the raster output was rejected because later text edits could not preserve local formatting.
