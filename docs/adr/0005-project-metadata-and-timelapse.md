# ADR-0005: Project Metadata And Timelapse Snapshots

[中文](0005-project-metadata-and-timelapse.zh-CN.md) | English

> Storage is superseded by [ADR 0023](0023-local-timelapse-library.en.md): desktop recordings use a local library and ordinary saves store references. Embedded storage and earlier sampling descriptions below are historical; see [Product Behavior](../product/behavior.en.md) for current recording behavior.

## Status

Accepted

## Context

Grid visibility must follow each project after reopening, while navigation such
as zoom and pan must remain session-only. Project statistics and timelapse
recording also need to survive save and recovery without entering the document
undo stack. Recording raw pointer events would make replay dependent on tool
implementation details, while full-size raw snapshots would make projects grow
without a practical bound.

## Decision

- Persist only pixel-grid visibility, custom-grid visibility, and custom-grid
  geometry as project display metadata. Keep zoom, pan, rotation, and mirroring
  in the session.
- Persist normalized counters for committed operations, drawing strokes, and
  active drawing duration.
- When timelapse recording is enabled, capture a composited PNG at committed
  document-operation boundaries. Do not capture view-only or panel actions.
- Store timelapse PNG files under `timelapse/` and keep their metadata in the
  manifest. Limit the active snapshot list to 600 entries and downsample older
  entries when the limit is reached.
- Export the recorded snapshots as a real video through the renderer's
  `MediaRecorder` support. MP4 and WebM are offered independently; the
  selected container is checked with `MediaRecorder.isTypeSupported()` before
  encoding. If the runtime cannot provide the requested encoder, fail with a
  visible message instead of producing a file with a mismatched extension.

## Consequences

Grid choices are project-specific without serializing transient navigation.
Timelapse recording increases CPU work and project size only while explicitly
enabled. Snapshot-based recording remains independent from undo internals and
future tool implementations, but it cannot reconstruct intermediate pointer
movement between committed edits.

## Alternatives

Persisting every pointer event was rejected because replay would depend on tool
versions and selection state. Persisting full undo entries was rejected because
undo data is not a stable file format and may omit the information required for
forward replay.
