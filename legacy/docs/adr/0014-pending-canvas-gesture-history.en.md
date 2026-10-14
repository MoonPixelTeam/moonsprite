# ADR 0014: Use Independent Gesture History for In-Progress Paths

[中文](0014-pending-canvas-gesture-history.md) | English

- Status: Accepted
- Date: 2026-08-17

## Context

Freeform shapes, polygon shapes, and lassos exist only in canvas input state before confirmation. Sending Undo directly to the document at that point would undo an earlier committed drawing. Continuing the gesture would then clear that document Redo, making the original operation impossible to restore.

## Decision

While these tools have a gesture in progress, they maintain an independent Undo/Redo stack of path points. Workspace Undo/Redo first delegates to the active document's gesture controller. Undoing the final path point ends the temporary gesture; subsequent Undo commands continue through document history. Adding a path point clears gesture Redo.

After confirmation, the temporary stack is discarded and the final pixels or selection enter formal document history as one operation. Canceling creates no formal history entry and does not change dirty state.

## Consequences

- Intermediate path points can be undone and redone; undoing the last point cancels the gesture and restores access to document history.
- Previously committed drawing history and Redo remain intact while a draft is in progress.
- Document history, save points, and timelapse recording continue to observe only confirmed operations.

## Alternatives

Writing every temporary path point directly to document history would pollute the save point and leave many invalid entries after confirmation. Intercepting Undo only in component keyboard handlers would not cover menus and other command entry points. Both alternatives were rejected.
