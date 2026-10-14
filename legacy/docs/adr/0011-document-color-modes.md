# ADR-0011: Document Color Modes And Raster Formats

[中文](0011-document-color-modes.zh-CN.md) | English

## Status

Accepted

## Context

The document color mode previously doubled as the physical raster format. That worked for RGBA and indexed storage, but adding grayscale would make runtime code treat every non-RGBA mode as indexed. Indexed editing also created new palette entries from arbitrary paint colors, so the canvas was not actually constrained to the visible palette.

## Decision

- Project schema v10 stores document modes `rgba`, `indexed`, and `grayscale`.
- Physical raster data remains either `rgba` or `indexed`. Grayscale documents use RGBA surfaces with equal RGB channels and independent alpha.
- Indexed canvas writes resolve only against colors listed in the current `paletteOrder`. Exact matches are reused; other colors map to the nearest visible RGBA entry without adding palette entries.
- Removing or replacing visible palette colors remaps affected indexed layer and animation-cel storage as part of the same undoable palette operation.
- RGBA-to-indexed conversion preserves the current palette and maps every layer and animation cel. Conversion to grayscale uses perceptual luminance and preserves alpha.
- Schema v1-v9 projects keep their existing RGBA or indexed interpretation and migrate to v10 without synthetic grayscale data.

## Consequences

Document intent is no longer confused with byte layout. Runtime raster encoding remains backward compatible, grayscale survives project round trips, and indexed pixels cannot silently depend on hidden historical palette entries.

## Alternatives

Adding a third physical sparse-raster encoding was rejected because grayscale still needs alpha and gains no storage or compositor benefit from a separate byte layout. Automatically adding every painted color to an indexed palette was rejected because it defeats indexed-color constraints and makes the visible palette an unreliable source of truth.
