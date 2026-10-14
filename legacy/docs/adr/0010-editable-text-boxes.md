# ADR-0010: Editable Text Boxes

[中文](0010-editable-text-boxes.zh-CN.md) | English

## Status

Accepted

## Context

Point text grows with its content, but paragraph text needs a persistent canvas area so long content wraps predictably and remains editable after reopening a project.

## Decision

- Project schema v9 stores optional `boxWidth` and `boxHeight` values on editable text cels.
- A click creates point text without box metadata. A pointer drag creates boxed text using the dragged canvas-pixel rectangle.
- Wrapping is visual layout only: source text and style-run character offsets are not modified.
- Boxed text raster surfaces use the exact saved box dimensions, wrap by character when the next glyph would exceed the inner width, and clip pixels outside the saved height.
- Schema v1-v8 text migrates without synthetic box dimensions and retains point-text behavior.

## Consequences

Text boxes survive editing, transforms, copying, and project round trips without inserting artificial newline characters. Character-level wrapping also supports CJK and long words, while point text remains backward compatible.

## Alternatives

Writing automatic newlines into source text was rejected because resizing or restyling could not recover the original content. Storing the rectangle only in the raster surface was rejected because editing would lose the intended wrapping boundary.
