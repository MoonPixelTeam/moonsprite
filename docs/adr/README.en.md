# Architecture Decision Records

[中文](README.md) | English

ADRs record decisions that will affect the implementation over the long term, so future contributors can understand the reasons behind the code.

## Usage

Use the filename format `NNNN-short-title.md`. Valid statuses are "Proposed", "Accepted", "Deprecated", and "Superseded".

Each ADR contains context, a decision, consequences, and alternatives. Record only architectural decisions that must remain enforceable over time, not routine bug fixes.

## Current Decisions

- [0001: Separate Document History from View State](0001-separate-document-and-view-history.en.md)
- [0002: Separate the Animation Timeline from Static Layer Data](0002-animation-timeline-schema.en.md)
- [0003: Synchronize the Active Layer Surface with Animation Cel Pixels](0003-animation-cel-surfaces.en.md)
- [0004: Isolate Animation Export and Onion Skin](0004-animation-export-and-onion-skin.md)
- [0005: Persist Project Metadata and Timelapse Snapshots](0005-project-metadata-and-timelapse.md)
- [0006: Adaptive Palette Slots](0006-fixed-palette-slots.md)
- [0007: Per-Frame Editable Layer and Group Masks](0007-attached-layer-masks.md)
- [0008: Sparse Raster Project Storage](0008-sparse-raster-project-storage.md)
- [0009: Editable Text Style Runs](0009-editable-text-style-runs.md)
- [0010: Editable Text Boxes](0010-editable-text-boxes.md)
- [0011: Separate Document Color Modes from Raster Formats](0011-document-color-modes.md)
- [0012: Non-Destructive Layer Styles](0012-non-destructive-layer-styles.md)
- [0013: Editable Background Layers](0013-background-layers.md)
- [0014: Use Independent Gesture History for In-Progress Paths](0014-pending-canvas-gesture-history.en.md)
- [0015: Separate Tilemap Source Data from the Tiled View](0015-tilemap-source-and-tiled-view.en.md)
- [0016: Separate the Free-Tile Source Library from Arbitrarily Positioned Instances](0016-free-tile-source-and-instances.en.md)
- [0017: Share Project Tilesets Across Tilemap Layers](0017-shared-tilemap-tilesets.en.md)
- [0018: Use Stable Frame Endpoints for Animation Loop Sections](0018-animation-loop-sections.en.md)
- [0019: Use Snapshots and Typed Transaction Boundaries for Lua Scripts](0019-lua-script-snapshot-transactions.en.md)
- [0020: Use a Restricted ZIP, Atomic Installation, and Runtime Security Boundary for Extension Packages](0020-extension-package-format.en.md)
- [0021: Linked layers use stable identities and shared raster storage (Chinese)](0021-linked-layers.md)
- [0022: Free-tile layers share a stable source set (Chinese)](0022-shared-free-tile-sets.md)
- [0023: Local immutable timelapse library](0023-local-timelapse-library.en.md)

Increment the number when adding an ADR. Keep deprecated decisions in place and link them to the superseding ADR.
