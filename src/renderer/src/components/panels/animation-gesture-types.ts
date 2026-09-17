export type AnimationLoopSectionResizeEdge = 'start' | 'end'

export type AnimationPointerDrag =
| { kind: 'frame'; sourceFrameId: string; frameIds: string[]; preserveSelection: boolean; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
| { kind: 'cel'; sourceAnchorKey: string; cellKeys: string[]; preserveSelection: boolean; selectionMode?: 'toggle' | 'range'; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
| { kind: 'group-cel'; sourceAnchorKey: string; preserveSelection: boolean; selectionMode?: 'toggle' | 'range'; startX: number; startY: number; moved: boolean; canMove: boolean; lastSelectionTarget: string }
| { kind: 'mask'; sourceAnchorKey: string; cellKeys: string[]; preserveSelection: boolean; selectionMode?: 'toggle' | 'range'; startX: number; startY: number; moved: boolean; canMove: boolean; pendingSelection: boolean; longPressed: boolean; longPressTimer: number | null; lastSelectionTarget: string }
| { kind: 'loop-section'; sectionId: string; edge: AnimationLoopSectionResizeEdge; startX: number; startY: number; startIndex: number; endIndex: number; previewStartIndex: number; previewEndIndex: number; moved: boolean }

export type AnimationGestureSelection = { kind: 'frame'; ids: string[] } | { kind: 'cel' | 'mask'; keys: string[] }

export type AnimationGestureActiveTarget = { kind: 'frame'; frameId: string } | { kind: 'cel' | 'mask'; layerId: string; frameId: string }
