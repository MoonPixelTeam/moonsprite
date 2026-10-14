# ADR 0001: Separate Document History from View State

[中文](0001-separate-document-and-view-history.md) | English

- Status: Accepted
- Date: 2026-07-31

## Context

Canvas pan, zoom, rotation, and panel layout could previously share update paths with document edits. As a result, Undo could change dirty state even when no pixels had been edited, or could restore an unexpected view state.

## Decision

Undo history stores only operations that change project content. View, tool, dialog, and workspace-layout state use separate update paths, do not enter document history, and do not change the save point.

Temporary edits enter history as one transaction when confirmed. Canceling creates no history entry. The save point is determined by the history position rather than by ordinary Store update counts.

## Consequences

- Undo/Redo behavior can be tested consistently.
- View interactions no longer mark the project as unsaved.
- Store decomposition must preserve separate entry points for document operations and view operations.

## Alternatives

Putting complete session snapshots into one history is simple, but consumes more memory and incorrectly treats tool and view behavior as document edits, so it was rejected.
