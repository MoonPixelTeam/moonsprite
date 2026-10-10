# ADR 0024: Save reference images with projects

English | [中文](0024-project-reference-images.md)

## Status

Accepted for project format v21.

## Context

Reference images lived only in the application session. Reopening a project after quitting lost them, and multiple projects shared one reference library.

## Decision

- Projects store an optional `referenceImages` manifest with stable IDs, dimensions and `references/<id>.rgba` paths. Raw RGBA pixels are embedded in the ZIP; ordinary saves, Save As and recovery snapshots share the same codec boundary.
- References added through the canvas double-click menu use a separate `canvasReferences` list for order, names, placement, dimensions, angles, mirrors, opacity, locking, independent floating state and initial placement. Original image data URLs are embedded in `references/canvas/<id>.dataurl`, without external file dependencies. Runtime `documentId` values are excluded.
- Migrate v1-v20 to empty reference libraries, ignoring unknown fields with the same name. A missing v21 list also means an empty library. Reject invalid dimensions, IDs, paths, resource lengths or duplicate IDs with an observable error.
- Reference panel additions and removals use Store metadata commands without changing drawing history. Canvas reference edits retain their existing undo history; commits, undo and redo update project metadata, while cancelled gestures do not commit. Neither reference type changes artwork pixels.
- Canvas navigation stays outside document history. Panel browsing, view navigation, windows and luminance display remain in each project session. Canvas references update their DOM positions and selection outline in the canvas preview frame; independently floating images retain their screen position.
- Switching projects restores their separate libraries. Switching during a clipboard read cancels that paste so it cannot write into another project.

## Consequences and limitations

Reopening a saved project restores references without external files or clipboard content. Reference images increase file size, and older readers do not support v21. References never saved in previous sessions cannot be recovered from old projects.
