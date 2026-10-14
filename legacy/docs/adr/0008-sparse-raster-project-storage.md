# ADR-0008: Sparse Raster Project Storage

[中文](0008-sparse-raster-project-storage.zh-CN.md) | English

## Status

Accepted

## Context

Large MoonSprite projects may contain dozens of canvas-sized layer and cel
surfaces whose meaningful pixels occupy only a small fraction of each surface.
ZIP Deflate keeps the file compact on disk, but opening still expands every raw
surface before the editor can use it. A 4596 x 1767 project can therefore expand
hundreds of megabytes even when most tiles are transparent.

## Decision

- Project schema v5 may store each layer or cel as one `sparse-tiles-v1`
  resource containing only nonzero 64 x 64 tiles. It does not create thousands
  of ZIP entries.
- The writer compares sparse and raw byte counts per resource and keeps the
  smaller representation. RGBA tile occupancy checks all four bytes so hidden
  RGB values under zero alpha remain lossless; indexed occupancy treats ID 0 as
  transparent.
- The reader validates the complete tile directory and reconstructs one
  contiguous raster surface covering the stored tile bounds. Its canvas offset
  and stable storage origin preserve document coordinates, while tools,
  compositing, history, Store, and platform APIs continue to use the existing
  contiguous-surface contract.
- Schema v1-v4 resources migrate as raw data in memory. Their first save writes
  schema v5 and may choose sparse storage. Unknown encodings and malformed tile
  containers are rejected.
- Incremental save continues to track one CRC and revision per raster resource.
  Unchanged v5 resources reuse their original path, encoding, dimensions,
  offsets, and compressed ZIP entry; changed compact surfaces are encoded from
  their current runtime geometry.
- Opening registers the incremental-save baseline from the decoded manifest,
  resource references, and ZIP CRCs without re-encoding all pixels. Worker
  routing estimates expanded raster bytes from the manifest so a compact v5 ZIP
  cannot move a large allocation back onto the UI thread.

## Consequences

Sparse large projects expand far fewer bytes from ZIP, can avoid allocating
transparent space outside each resource's stored tile bounds, and avoid a
second full raster scan after decoding. Projects whose content spans distant
tiles inside most layer bounding boxes may see little runtime-memory reduction;
this design is not a permanently tiled runtime. Runtime rendering and editing
preserve the existing pixel representation and visual output. Dense resources
can remain raw, and a saved v5 file requires a v5-aware reader even though v5
readers remain backward compatible with v1-v4.

## Alternatives

One ZIP entry per tile was rejected because thousands of central-directory
entries add metadata, lookup, and merge overhead. Keeping only raw resources was
rejected because Deflate reduces disk size but not expanded decode work. A
permanently tiled runtime model was deferred because it would cross drawing,
selection, undo, compositing, and cache ownership boundaries.
