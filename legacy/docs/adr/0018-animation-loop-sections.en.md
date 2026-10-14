# 0018: Use Stable Frame Endpoints for Animation Loop Sections

[中文](0018-animation-loop-sections.md) | English

## Status

Accepted

## Context

Users need to save a continuous timeline range as a named loop section that can play independently, run in reverse, and repeat a limited number of times. A loop section must survive frame reordering, deletion, undo, and project reopening without introducing a second playback timer or writing current playback progress into document history.

## Decision

- Store loop sections as `AnimationTimeline.loopSections` document data, described by a stable loop-section ID, stable start and end frame IDs, name, direction, and repeat count.
- Upgrade `.moonsprite` to schema v16. Migrate v1-v15 to an empty loop-section list, without reading unknown same-named fields from older versions.
- Frame reordering changes only endpoint positions on the timeline, not endpoint identity. Deleting an endpoint frame shrinks the range to the nearest surviving frame inside it; deleting the sole frame of a one-frame loop section removes the section.
- Creating, editing, and deleting loop sections, plus frame deletion that changes loop sections, enter minimal document history. Playback target, the frame before playback began, and completed repeat count live in `DocumentSession` and do not change dirty state.
- Independent loop playback reuses the shared animation clock and existing frame durations. A finite loop stops after its terminal frame has been fully displayed; an infinite loop returns to the first frame for its direction.

## Consequences

Loop sections remain stable across frame-structure changes and share one source of data with project persistence, undo, and timeline UI. The Layers panel, Preview panel, and future playback entry points continue to advance through one clock rather than adding duplicate timers.

## Alternatives

Saving frame indexes would point to the wrong content after insertion, deletion, or reordering. Creating an independent timer for each loop section would make multiple panels advance frames redundantly. Both alternatives were rejected.
