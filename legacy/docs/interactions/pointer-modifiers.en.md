# Pointer and Modifier-Key Contract

[中文](pointer-modifiers.md) | English

The pointer communicates what will happen if the user presses now; it must not be derived only from the active tool name. Tool switches and modifier press or release update the pointer immediately without requiring another mouse move.

Standard CSS cursor types (such as `pointer`, `text`, `move`, and directional `resize`) are mapped globally to cursor variables from the component library. New components do not bind cursor images individually; stylesheets, dynamically inserted styles, inline styles, and portals use the same mapping. Mapping preserves selector priority, `!important`, `none`, and specialized canvas cursors, without scanning the page or reading layout on pointer movement. The shared theme still controls cursor scale and system-cursor preferences. Native interfaces such as system file dialogs are outside this DOM mapping boundary.

## General Priority

1. Dialog, input, and menu interaction.
2. Prohibited state, such as a hidden or locked active layer.
3. Active drag, drawing, or transform.
4. Temporary modifier behavior.
5. Active tool default behavior.
6. Default pointer.

Only one custom pointer may be active at a time. It must not flicker on top of the system pointer or another tool pointer.

After selection content enters a scale or rotation drag, show the move pointer consistently. On release, restore the scale or rotation pointer matching the current hit region.

Preferences may disable local pixel cursors and fall back to system cursors, and may scale pixel cursors uniformly to 100%, 125%, 150%, or 200%. The image and hotspot use the same scale so the actual target does not move.

## Modifier Keys

Every actual tool has an adjacent “Quick Select” entry in Shortcut Settings > Tools. A quick selection accepts a modifier alone, an ordinary key, or a combination. Holding the complete binding temporarily overrides the current tool until any constituent key is released. Defaults are Move = `Ctrl`, Eyedropper = `Alt`, and Hand = `Space`; other tools start unbound. Brush-size and contextual modifiers remain in Tool Modifiers. Pointers, hints, and actual operations use this same configuration.

While a temporary tool is active, the tool rail shows that tool as selected. The original tool is only temporarily overridden, is not written into tool settings, and does not enter undo history. Before a drag begins, every current tool except selection and shape tools may enter the temporary move tool. Selection and shape tools always retain their own behavior, even when `Ctrl` is pressed before pointer down; rectangles and ellipses then use center-origin creation semantics. Radial-gradient center creation with `Ctrl` also takes priority over quick Move bound to `Ctrl`; Move bindings without `Ctrl` follow the normal rules. Once a drawing or transform drag begins, that process's own modifier combinations take priority. While the temporary-move modifier remains held, pressing another modifier must not exit temporary move unless it fully matches a more specific quick-tool binding or a higher-priority operation for the current tool. Releasing modifiers, window blur, or page hiding immediately restores the original tool's selected state and behavior.

Shortcut capture is one key session. `Ctrl`, `Alt`, `Shift`, and `Meta` pressed first update preview only; a non-modifier key commits the complete combination. A modifier-only binding commits when the modifier is released or the input loses focus. The recorder accepts left, right, middle and side mouse buttons, left double-click, wheel up/down, and modifier combinations. Quick-tool and contextual-modifier commands that require holding reject left/right click, double-click, and wheel bindings; ordinary commands may use them. The capture field has priority over application command dispatch, so MoonSprite's own paste command must not intercept combinations such as `Ctrl+Shift+V`. `Escape` abandons the current capture. `Delete` or `Backspace` clears the binding.

| Scenario | Alt | Ctrl | Shift |
| --- | --- | --- | --- |
| Non-selection, non-shape, non-radial-gradient tool before drag | Defined by the tool | Temporary move tool; after drag begins, the current process combination takes priority | Constraint defined by the tool |
| Selection or shape tool before drag | Defined by the tool | Keep current tool; next rectangle or ellipse drag grows to both sides from initial press | Constraint defined by the tool |
| Pointer held while creating a rectangle or ellipse selection or shape | Adjust current selection or shape rotation direction | Create symmetrically around initial press | Preserve 1:1 ratio; may combine with Ctrl |
| Radial-gradient drag | None | Expand around the initial point | Lock to a 1:1 circle; may combine with Ctrl |
| Move content inside selection | Temporary color picker | Copy selected content | Horizontal or vertical constraint |
| Move selection outline from its edge | Temporary color picker | Do not copy pixels | Horizontal or vertical constraint |
| Transform from selection scale handle | Transform both sides around current pivot | Integer nearest-neighbor multiples | Preserve original aspect ratio; with Ctrl, use integer multiples at the original ratio |
| Rotate selection | Temporary color picker | Do not change rotation semantics | Snap every 45° to eight directions |
| Move-tool click or drag on a layer | Copy layer | Tool-defined | Clicking another layer adds it to selection; continued drag is constrained horizontally or vertically |
| Drag in layer panel | Show copy intent and copy | None | Preserve ordering semantics |
| Drag with zoom tool | None | None | Temporarily use percentage-step zoom without entering hand pan; restore the preference default after release |
| Rotate-view tool | Temporary color picker | Preserve or reset original direction | Rotate in eight-direction increments |

While the pointer remains held during creation of a rectangle or ellipse selection or shape, holding `Space` temporarily moves the current object. Movement uses the pointer position at `Space` press as its baseline. The current tool pointer remains unchanged. Releasing `Space` continues adjustment from the new position without a jump.

## Straight-Line Connection Mode

Straight-line connection is a configurable modifier behavior for pencil and eraser, triggered by `Shift` by default. It belongs under Shortcut Settings > Modifiers and is no longer a Preferences setting. When disabled, `Shift` retains only constraints defined by other tools and does not connect to the previous paint point.

When pencil or eraser has a previous paint anchor, a complete match for the line-connection combination takes priority over temporary move. With defaults, `Ctrl+Shift` must continue showing a direction-constrained line preview and commit the line; the tool rail must not temporarily switch to Move. The line preview appears only when no canvas drag is already active. Accidentally pressing `Shift` after beginning a continuous held stroke must not display the previous anchor's line preview or interrupt the current stroke.

When ISO view and Force Line Alignment are enabled, alignment takes priority over ordinary line-direction modifiers. The line tool, single-drag pencil/eraser lines, and connected lines anchor at the initial point and snap to horizontal, vertical, or the configured ISO `N:1` stair directions using balanced pixel steps. Disabling forced alignment restores ordinary freehand and modifier behavior.

Releasing the keys immediately restores original behavior and pointer. Window blur, pointer leaving the window, or capture release ends temporary state. Every canvas or layer-panel pointer event corrects cached `Alt/Ctrl` state from the event itself so a missed `keyup` during hot reload or focus changes cannot leave color-pick or copy mode permanently active.

A locked symmetry axis cannot move through an ordinary pointer drag. Holding `Ctrl` temporarily permits dragging the axis; releasing it immediately stops that movement.

Canvas wheel input supports standard `wheel`, legacy `mousewheel`, and devices that provide horizontal deltas only. Devices such as TourBox do not need activation by an ordinary mouse wheel first. An event affects only the active canvas under the pointer; input fields, panel scroll regions, and modal dialogs retain their own scrolling semantics.

The initial press is the default center for rectangle/ellipse creation. With fixed-center drawing enabled in tool options, the saved drawing anchor takes precedence for both preview and commit. See [Selections and Transforms](selection-transform.en.md) for anchor adjustment and visibility.

## Hotspot Rules

- Brush pointer hotspots identify the actual painted pixel. Even-sized brushes use the product rule of the lower-right center pixel.
- The eyedropper hotspot is at the lower-left of effective artwork.
- Move and copy hotspots are at the visual top-left.
- Selection corner marks are canvas preview and do not change the mouse hotspot. The mouse cursor is hidden by default. When enabled in Preferences, use a true crosshair cursor with a centered hotspot and do not draw the crosshair inside the corner marks.
- A selection tool outside canvas content bounds still shows the selection-creation pointer and four corner marks, not a prohibited pointer. Only a genuinely non-editable layer shows prohibited state.
- Rotation handles use matching corner cursors and their hit regions must not overlap scale handles.

Pointer source artwork uses a 16x16 grid and exports to 32x32 PNG. Coordinates below use the exported image's top-left as `(0,0)`:

| Pointer | 32x32 hotspot |
| --- | ---: |
| Default, button, help, text | `(9,5)` |
| Wait, progress, project (row 1, cell 4) | `(11,5)` |
| Black/white brush, black/white selection, crosshair | `(15,15)` |
| Prohibited | `(15,15)` |
| Hand, grabbing | `(16,16)` |
| Move, swatch-edge drag | `(3,3)` |
| Eyedropper | `(5,28)` |
| Move selection outline | `(3,3)` |
| Copy | `(5,3)` |
| Zoom tool (row 3, cell 1) | `(13,13)` |
| Rotate view (row 3, cell 2) | `(12,22)` |
| Vertical scale (row 2, cell 1) | `(15,15)` |
| Horizontal scale (row 2, cell 2) | `(15,15)` |
| Both diagonal scales (row 2, cells 3 and 4) | `(16,16)` |
| Four corner selection rotations | `(16,16)` |

After changing pointer artwork or hotspots, validate 1px, 2px, and large brushes in normal and rotated views and under high DPI.

Preferences > Cursor > Use Software Cursor is enabled by default. When enabled, every state uses MoonSprite's built-in pixel cursor and allows cursor scaling. When disabled, ordinary operations use the computer's system cursor, while special states without a system equivalent, such as scale, rotate view, and selection rotation, continue using MoonSprite cursors. Any asset load failure must retain a valid CSS fallback and must not display a blank or incorrect prohibited cursor. Source cell `(5,2)` in the 16x16 grid is the move cursor and uses a 32x32 exported resource.
