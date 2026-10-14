# ADR-0006: Adaptive Palette Slots

[中文](0006-fixed-palette-slots.zh-CN.md) | English

## Status

Accepted

## Context

The palette previously persisted only a compact color order. Its CSS grid
changed column count with panel width, so the same order appeared in different
two-dimensional positions. A compact order also cannot represent empty cells,
which prevents users from arranging colors into stable visual groups.

## Decision

- Keep `paletteOrder` as the compact list of visible stable color IDs for
  existing indexed-color and palette export behavior.
- Add `paletteColumns` and `paletteSlots` as a row-major two-dimensional layout
  of color IDs or `null`. Slot changes are document edits and participate in
  undo and project persistence.
- Fit the displayed grid to the panel viewport by adding or removing only empty
  right and bottom edges. Preserve occupied coordinates beyond the viewport and
  expose them through horizontal or vertical scrolling.
- Treat missing `paletteSlots` as a legacy v2 document and generate slots from
  `paletteOrder`. Ignore invalid or duplicate slot IDs and append any missing
  visible IDs to the first available empty slots.
- Moving onto an empty slot preserves the source as empty. Moving onto occupied
  slots swaps the displaced colors back into the vacated source slots.
- Local palette files use schema v2 to preserve columns, occupied positions,
  and empty slots with portable color indexes. Schema v1 files remain readable
  as compact color lists and create a sequential slot layout when applied.

## Consequences

Panel resizing no longer reflows occupied colors, while empty cells still fill
the available panel area. User-defined spacing survives project save, local
palette save, recovery, undo, and redo. Runtime code must keep `paletteOrder`,
`paletteColumns`, and `paletteSlots` synchronized whenever visible palette
colors are added, removed, or moved.

## Alternatives

Storing `null` directly in `paletteOrder` was rejected because indexed-color
and palette-export code relies on it being a compact list of stable IDs. Keeping
the layout only in local preferences was rejected because palette arrangement
belongs to the project and must travel with the file.
