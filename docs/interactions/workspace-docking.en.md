# Workspace and Docking Contract

[中文](workspace-docking.md) | English

## Panels and Dock Areas

- Independent windows such as palette, layers, preview, and brushes are called panels.
- Panels can dock left, right, or bottom, or become resizable floating windows.
- Color, palette, layers, preview, Tileset, and brush-library visibility are independent. Hidden panels occupy no dock space and can be shown again from Window > Panels. The brush library is visible and docked right by default. Tileset default visibility still depends on whether the active project contains a Tilemap layer.
- Color, palette, layers, preview, Tileset, and brush-library panels each have a configurable popup-panel shortcut. Triggering the shortcut for a docked panel temporarily moves the real panel instance into a popup; its original dock slot occupies no space during the popup, but persistent visibility, dock, order, and size must not change. Interaction within the panel and its own overlays keeps it open. Clicking outside, window blur, triggering the same shortcut again, or pressing `Escape` closes it and restores the original dock position. A floating panel ignores its popup-panel shortcut.
- Popup panels are draggable and use the shared eight-direction resize region. Each panel stores its own temporary window size. Every invocation opens centered on the most recent pointer position and is constrained into the visible application area near an edge. The window may move freely while open. The next invocation reuses the last size and recenters around the current pointer.
- Right-clicking a panel title opens the shared panel menu, which can hide the panel or move it directly to left, right, bottom, or floating. Blur closes the menu.
- The tool rail can dock to the left, right, top, or bottom edge of the workspace. It is vertical on the sides and horizontal on the top or bottom and does not participate in panel stacking.
- Tool-rail position changes through Window > Toolbar Position, a shortcut, or title dragging. Dragging previews the workspace edge nearest the pointer. The tool rail cannot float.
- An occupied dock shows only an insertion line. An empty dock shows a small area preview.
- Drag preview must not make panels flicker or change the real layout early.

## Order and Size

- Panels in left and right docks stack vertically; separators resize adjacent heights.
- Panels in the bottom dock arrange horizontally; separators resize adjacent widths.
- Left and right docks store absolute pixel width. Window resizing keeps that width. If space is insufficient, apply only a temporary constraint and restore the user's width after the window grows. Bottom dock height is stored as a ratio of editor height and follows application height.
- Panels inside left and right docks store relative height weights and grow or shrink together according to separator-created ratios. Panels inside the bottom dock store absolute pixel widths. The Layers panel has priority as the primary panel that absorbs remaining space; without Layers, the first unlocked panel absorbs it. Other panels must not be automatically divided evenly or stretched. When a panel leaves, the primary panel fills the gap immediately without overwriting preferred widths.
- An old workspace with only side-width ratios converts each ratio once into pixel width using the current parent container. The migrated width no longer follows window size.
- After a panel is moved out, remaining panels fill the gap immediately.
- Floating-window size and position persist across restarts. Floating panels and modal dialogs keep width and height independent of application resizing. Their horizontal and vertical positions restore from percentages of their respective movable ranges and are clamped only when needed to remain visible.
- Every floating panel and modal dialog shares one eight-direction resize behavior. Four edges and four corners use compact continuous hit bands centered on visible borders, with consistent direction, and do not cover nearby body controls.
- During drag or resize, capture the active pointer and pause resize-observer back-synchronization into interaction state. Reaching or briefly leaving the application edge must not make the window flicker, jump back, or lose its final position.
- Fixed-height dialog bodies consume remaining height. Shortcut Settings category navigation and list extend downward together. The action bar remains at the bottom with no unused blank area.
- The Preview panel does not use an independent viewport-ratio scaling rule. Resizing immediately refits artwork to the new content area and must not reuse the old window ratio.
- Resizable dialog bodies consume remaining height and the bottom action bar stays against the dialog bottom. Increasing dialog height must not create blank space below the action bar.
- Panel visibility, dock, order, dock size, floating position, and tool-rail position belong to the current workspace layout, save immediately, and do not enter document undo history.

## Re-square Color Picker

- Re-square restores the color-picking body to an absolute square and must not shrink it further on repeated clicks.
- For the top panel in a side dock, keep the top fixed and resize downward. For the bottom panel, keep the bottom fixed and resize upward. For a middle panel, keep the top fixed and resize downward.
- In the bottom dock, keep the left fixed for the leftmost panel, the right fixed for the rightmost panel, and the left fixed for a middle panel.
- Separators remain draggable after re-square. A click must not snap the layout back to an old size.

## Workspace Lifecycle

- Every workspace stores `initialLayout` and `currentLayout`.
- Every layout change updates the active workspace's `currentLayout` immediately.
- Switching workspaces applies the target current layout directly to avoid full-screen flicker from clearing and rebuilding.
- Reset Current Workspace restores only `currentLayout` from `initialLayout`.
- The default workspace cannot be deleted, but it can be modified and reset.
- An old workspace without `panelVisibility` shows color, palette, layers, and brush library by default and migrates Preview visibility from the old `previewOpen` value.

## Document Split Panes

- Split panes use independent panels and nested splitters, following Aseprite's [`WorkspacePanel::setActiveView` and `dropViewAt`](https://github.com/aseprite/aseprite/blob/main/src/app/ui/workspace_panel.cpp). Layout containers are nested; documents do not own other panes.
- Switching top tabs changes only the document shown in the main panel. When A and B are split and C is selected, C takes A's region while B and any further splits retain their position, size ratios, and canvas components. Creating, opening, and switching documents through shortcuts follow the same rule.
- Panel identity is independent of document identity. After switching the main document, docking the previous document, moving panes, and resizing splitters remain available. Clicking a secondary panel activates its document without replacing the main panel's content; views, tools, and undo remain managed by their document sessions.
- Closing the main document first selects another top-tab document in that panel. Closing the last document in a secondary panel collapses only that empty panel, allowing its neighbor to fill the space without importing an unrelated document. Floating and returning retain the existing explicit move rules. Layout changes never enter document undo history.

## Project Canvas Snapping

- When dragging a project tab out from the top, hit testing uses only the pointer point. The original canvas is fully divided into top, bottom, left, and right snap regions with no invalid center. A snap indicator must not appear while the pointer remains outside the canvas.
- Moving between the four regions recalculates direction from the current position every time. A previous snap direction must not block another.
- On a fast first entry, if the actual path between adjacent pointer positions crosses an internal canvas snap region even though the event endpoint jumps to the middle, recognize the crossed direction. This compensation must not use expanded area outside the canvas.
- After the snap indicator appears, continue hit testing against the first-hit original canvas rectangle. Temporary preview layout must not shrink or move the hit region.
- During drag, the snap indicator occupies preview space at the corresponding edge of the original canvas and the canvas yields smoothly. Preview must not remount the canvas component or temporarily rewrite the real split tree. Commit the real split only on pointer release.
- After docking, the newly placed project occupies one third of the target canvas and the original keeps two thirds. Left, right, top, and bottom use the same new-project ratio.
- Moving a merged project inside the canvas shows the same drag tab as a top project tab. The source canvas remains in place during drag and moves only on confirmed release.
- Dragging a merged project back to the top tab bar does not automatically switch the active main canvas. If the original main canvas remains in the split, it stays active. Promote another remaining project only when the original main canvas itself leaves.
- A project that already has a top main tab does not duplicate a split subtitle. Only projects hidden from the top tab bar after merging retain a subtitle as their drag handle.
- Each project's quick-command bar stores the horizontal ratio of its center relative to its owning canvas width. Split changes, merge, floating, or redocking restore by this ratio and add temporary pixel correction only to prevent leaving the canvas. Horizontal drag near the canvas center line snaps to 50%; leaving the snap range restores free movement. An expanded quick bar temporarily collapses when its canvas loses focus and restores its expanded state on focus return.

## Floating Project Windows

- Top project tabs and merged-project subtitles can move a project into an independent window through their context menu. Floating moves the current project view; it does not duplicate the project or canvas instance.
- A floated project is removed from the top tab bar and split layout. If it was the split's main project, another project is promoted to the main tab automatically, and a single remaining project returns to a normal canvas.
- A floating project window reuses panel title dragging, z-order raising, and eight-direction resize. Clicking it activates that project, but the center workspace must not also display the same project.
- An ordinary project window stays above the tool rail and tool-options bar but below modal dialogs and context menus. When Always on Top is enabled, it remains above all ordinary workspace windows until disabled.
- Dragging the floating title into the top project tab bar immediately hides the floating body and shows only a merged-project-style tab drag preview and insertion line, without top selected styling. Leaving the tab bar restores the window. Releasing returns the project at that position, while the current workspace remains on the original canvas and does not automatically switch to the returned project. The project may also return through a title button or context menu.
- Close follows the unsaved-project confirmation flow. Canceling close leaves the window unchanged.
