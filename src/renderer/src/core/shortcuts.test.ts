import { describe, expect, it } from 'vitest'
import { ANIMATION_PLAYBACK_SHORTCUT_MIGRATION_KEY, BRUSH_PANEL_SHORTCUT_MIGRATION_KEY, DEFAULT_SHORTCUT_BINDINGS, DEFAULT_SHORTCUTS, GRID_SHORTCUT_MIGRATION_KEY, POLYGON_LASSO_SHORTCUT_MIGRATION_KEY, POPUP_PANEL_SHORTCUT_MIGRATION_KEY, QUICK_TOOL_SHORTCUT_IDS, REPLACE_COLOR_SHORTCUT_MIGRATION_KEY, SHORTCUTS_KEY, SHORTCUTS_V2_KEY, SHORTCUT_GROUPS, SHORTCUT_LABELS, assignShortcutBinding, cloneShortcutBindings, createShortcutSettingsFile, deriveShortcutConflicts, dispatchMouseDoubleClickShortcutInput, dispatchMouseShortcutInput, dispatchWheelShortcutInput, formatShortcutBindingsForLocale, importShortcutBindings, isFunctionKey, loadShortcutBindings, loadShortcuts, mouseDoubleClickShortcutText, mouseShortcutText, normalizeShortcut, parseShortcutJson, resetShortcutBindings, saveShortcutBindings, saveShortcuts, shortcutBindingBlocked, shortcutHeldByKeyParts, shortcutKeyPart, shortcutMatchesAnyEvent, shortcutMatchesEvent, shortcutReleasedByEvent, shortcutText, wheelShortcutText } from './shortcuts'

describe('shortcut persistence boundary', () => {
  it('recognizes only F1 through F12 as native function keys', () => {
    expect(Array.from({ length: 12 }, (_, index) => isFunctionKey(`F${index + 1}`))).toEqual(Array(12).fill(true))
    expect(isFunctionKey('F13')).toBe(false)
    expect(isFunctionKey('F0')).toBe(false)
    expect(isFunctionKey('F1x')).toBe(false)
  })

  it('only accepts known shortcut ids and string values', () => {
    expect(parseShortcutJson(JSON.stringify({ save: 'Ctrl+S', unknown: 'X', undo: 12 }))).toEqual({ save: 'Ctrl+S' })
  })




  it('registers every configurable command in one labeled group', () => {
    const grouped = new Set(Object.values(SHORTCUT_GROUPS).flat())
    expect(grouped).toEqual(new Set(Object.keys(DEFAULT_SHORTCUTS)))
    expect(SHORTCUT_LABELS['tool.selection.ellipse']).toBe('椭圆选区')
    expect(DEFAULT_SHORTCUTS.mirrorView).toBe('Ctrl+Shift+M')
    expect(DEFAULT_SHORTCUTS.mirrorViewVertical).toBe('Ctrl+Shift+Alt+M')
    expect(DEFAULT_SHORTCUTS.lineConnectionMode).toBe('Shift')
    expect(DEFAULT_SHORTCUTS['tool.move.quick']).toBe('Ctrl')
    expect(DEFAULT_SHORTCUTS['tool.eyedropper.quick']).toBe('Alt')
    expect(DEFAULT_SHORTCUTS['tool.hand.quick']).toBe('Space')
    expect(SHORTCUT_GROUPS.modifiers).not.toContain('tool.move.quick')
    expect(SHORTCUT_LABELS['tool.pencil.quick']).toBe('画笔（快速选择）')
    expect(DEFAULT_SHORTCUTS.adjustmentCurves).toBe('Ctrl+M')
    expect(DEFAULT_SHORTCUTS.adjustmentHueSaturation).toBe('Ctrl+U')
    expect(DEFAULT_SHORTCUTS.adjustmentColorBalance).toBe('')
    expect(DEFAULT_SHORTCUTS.newLayer).toBe('Shift+N')
    expect(DEFAULT_SHORTCUTS.toggleClippingMask).toBe('Ctrl+Alt+G')
    expect(DEFAULT_SHORTCUTS.polygonLasso).toBe('Shift+Q')
    expect(DEFAULT_SHORTCUTS['tool.fill.gradient']).toBe('Shift+G')
    expect(DEFAULT_SHORTCUTS.toggleCustomGrid).toBe("Ctrl+'")
    expect(DEFAULT_SHORTCUTS.toggleGrid).toBe("Ctrl+Shift+'")
    expect(DEFAULT_SHORTCUTS.toolRailLeft).toBe('')
    expect(DEFAULT_SHORTCUTS.toolRailTop).toBe('')
    expect(DEFAULT_SHORTCUTS.toolRailBottom).toBe('')
    expect(DEFAULT_SHORTCUTS.swapForegroundBackground).toBe('X')
    expect(DEFAULT_SHORTCUTS.addForegroundToPalette).toBe('Alt+S')
    expect(DEFAULT_SHORTCUTS.quickOutline).toBe('Shift+S')
    expect(DEFAULT_SHORTCUTS.outlineSelectionInside).toBe('S')
    expect(SHORTCUT_GROUPS.selection).toEqual(expect.arrayContaining(['quickOutline', 'outlineSelectionInside']))
    expect(SHORTCUT_GROUPS.color).toContain('addForegroundToPalette')
    expect(DEFAULT_SHORTCUTS.replaceColor).toBe('Ctrl+Shift+K')
    expect(SHORTCUT_GROUPS.color).toContain('replaceColor')
    expect(SHORTCUT_GROUPS.selection).toContain('toggleSelectionOutline')
    expect(SHORTCUT_GROUPS.file).toContain('exportSpriteSheet')
    expect(SHORTCUT_GROUPS.animation).toContain('toggleAnimationPlayback')
    expect(SHORTCUT_GROUPS.animation).toEqual(expect.arrayContaining(['toggleOnionSkin', 'enableAnimationFrames', 'disableAnimationFrames', 'toggleAnimationFramesDisabled', 'copyAnimationFrames', 'pasteAnimationCels', 'createAnimationLoopSection', 'openAnimationCelProperties']))
    expect(DEFAULT_SHORTCUTS.toggleAnimationPlayback).toBe('Enter')
    expect(DEFAULT_SHORTCUTS.toggleOnionSkin).toBe('')
    expect(DEFAULT_SHORTCUTS.addLinkedAnimationFrame).toBe('Alt+M')
    expect(SHORTCUT_GROUPS.animation).toContain('addLinkedAnimationFrame')
    expect(SHORTCUT_GROUPS.interface).toContain('toggleColorPanel')
    expect(SHORTCUT_GROUPS.interface).toEqual(expect.arrayContaining(['popupColorPanel', 'popupPalettePanel', 'popupLayersPanel', 'popupPreviewPanel', 'popupTilesetPanel', 'popupBrushLibraryPanel']))
    expect(SHORTCUT_GROUPS.interface.slice(0, 6)).toEqual(['popupColorPanel', 'popupPalettePanel', 'popupLayersPanel', 'popupPreviewPanel', 'popupTilesetPanel', 'popupBrushLibraryPanel'])
    expect(DEFAULT_SHORTCUTS.popupColorPanel).toBe('1')
    expect(DEFAULT_SHORTCUTS.popupPalettePanel).toBe('2')
    expect(DEFAULT_SHORTCUTS.popupLayersPanel).toBe('3')
    expect(DEFAULT_SHORTCUTS.popupPreviewPanel).toBe('4')
    expect(DEFAULT_SHORTCUTS.popupTilesetPanel).toBe('5')
    expect(DEFAULT_SHORTCUTS.popupBrushLibraryPanel).toBe('6')
    expect(SHORTCUT_GROUPS.interface).toContain('toggleTimeline')
    expect(SHORTCUT_GROUPS.tools).toContain('tool.shape.rectangle')
    expect(SHORTCUT_GROUPS.tools).toEqual(expect.arrayContaining(['tool.shape.freeform', 'tool.shape.polygon', 'toggleMoveAutoSelect', 'resetSymmetryCenter']))
    for (const quickId of QUICK_TOOL_SHORTCUT_IDS) {
      const index = SHORTCUT_GROUPS.tools.indexOf(quickId)
      expect(index).toBeGreaterThan(0)
      expect(quickId).toBe(`${SHORTCUT_GROUPS.tools[index - 1]}.quick`)
    }
    expect(SHORTCUT_GROUPS.tiles).toEqual(expect.arrayContaining(['tilemapModeEdit', 'tilemapModePaint', 'freeTileModeEdit', 'addFreeTileSource', 'openFreeTileInstanceProperties']))
    expect(SHORTCUT_GROUPS.brushes).toEqual(expect.arrayContaining(['importBrushImage', 'createBrushFolder', 'openBrushFolder', 'deleteBrushSelection']))
    expect(SHORTCUT_GROUPS.image).toEqual(expect.arrayContaining(['convertColorModeRgba', 'convertColorModeIndexed', 'convertColorModeGrayscale', 'cropCanvas', 'trimCanvas']))
    expect(SHORTCUT_GROUPS.view).toEqual(expect.arrayContaining(['toggleSliceOutlines', 'tileRepeatOff', 'tileRepeatBoth', 'tileRepeatX', 'tileRepeatY']))
    expect(SHORTCUT_GROUPS.layers).toEqual(expect.arrayContaining(['newTilemapLayer', 'newFreeTileLayer', 'createLinkedLayer', 'openLayerProperties', 'openLayerStyles']))
    expect(SHORTCUT_GROUPS.selection).toEqual(expect.arrayContaining(['deleteSelection', 'selectionModeReplace', 'selectAllSlices', 'openAutoSlice', 'openSliceProperties']))
    expect(DEFAULT_SHORTCUTS.toggleTimeline).toBe('')
    expect(DEFAULT_SHORTCUTS.rotateViewClockwise90).toBe('')
    expect(DEFAULT_SHORTCUTS.rotateViewCounterClockwise90).toBe('')
    expect(DEFAULT_SHORTCUTS.viewZoom100).toBe('')
    expect(DEFAULT_SHORTCUTS.viewZoom200).toBe('')
    expect(DEFAULT_SHORTCUTS.viewZoom400).toBe('')
    expect(DEFAULT_SHORTCUTS.viewZoom800).toBe('')
    expect(DEFAULT_SHORTCUTS.viewZoom3200).toBe('')
    expect(SHORTCUT_GROUPS.view).toEqual(expect.arrayContaining(['viewZoom100', 'viewZoom200', 'viewZoom400', 'viewZoom800', 'viewZoom3200']))
    expect(SHORTCUT_LABELS.openPreferences).toBe('首选项')
    expect(SHORTCUT_LABELS.toggleOnionSkin).toBe('洋葱皮开关')
    expect(SHORTCUT_LABELS.openScriptFolder).toBe('打开脚本文件夹')
    expect(DEFAULT_SHORTCUTS.newTilemapLayer).toBe('')
    expect(DEFAULT_SHORTCUTS.importBrushImage).toBe('')
    expect(DEFAULT_SHORTCUTS['tool.airbrush']).toBe('J')
    expect(DEFAULT_SHORTCUTS['tool.slice']).toBe('Shift+C')
    expect(normalizeShortcut('Ctrl+Shift+Alt+M')).toBe('Ctrl+Alt+Shift+M')
    expect(normalizeShortcut('Win+Space+MouseLeft')).toBe('Win+Space+MouseLeft')
  })

  it('tracks press and release for a held command shortcut', () => {
    const pressed = { key: 's', code: 'KeyS', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false } as KeyboardEvent
    const releasedKey = { key: 's', code: 'KeyS', ctrlKey: false, metaKey: false, altKey: true, shiftKey: false } as KeyboardEvent
    const releasedModifier = { key: 'Alt', code: 'AltLeft', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent

    expect(shortcutMatchesEvent(pressed, 'Alt+S')).toBe(true)
    expect(shortcutReleasedByEvent(releasedKey, 'Alt+S')).toBe(true)
    expect(shortcutReleasedByEvent(releasedModifier, 'Alt+S')).toBe(true)
    expect(shortcutMatchesEvent({ key: 'S', code: 'KeyS', ctrlKey: false, metaKey: false, altKey: false, shiftKey: true } as KeyboardEvent, DEFAULT_SHORTCUTS.quickOutline)).toBe(true)
    expect(shortcutMatchesEvent({ key: 's', code: 'KeyS', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent, DEFAULT_SHORTCUTS.outlineSelectionInside)).toBe(true)
    expect(shortcutText({ key: 'k', code: 'KeyK', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false } as KeyboardEvent)).toBe('Win+K')
  })



  it('dispatches a wheel binding as a consumable keyboard press and release', () => {
    const target = document.createElement('div')
    const phases: string[] = []
    target.addEventListener('keydown', (event) => {
      phases.push(`${event.type}:${event.key}`)
      if (shortcutMatchesEvent(event, 'Ctrl+WheelUp')) event.preventDefault()
    })
    target.addEventListener('keyup', (event) => phases.push(`${event.type}:${event.key}`))

    expect(dispatchWheelShortcutInput(target, { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, -120)).toBe(true)
    expect(phases).toEqual(['keydown:WheelUp', 'keyup:WheelUp'])
    expect(dispatchWheelShortcutInput(target, { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, 0)).toBe(false)
  })

  it('records and dispatches primary mouse interactions', () => {
    const target = document.createElement('div')
    const phases: string[] = []
    target.addEventListener('keydown', (event) => phases.push(`${event.type}:${event.key}`))
    target.addEventListener('keyup', (event) => phases.push(`${event.type}:${event.key}`))

    expect(mouseShortcutText({ button: 0, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe('Ctrl+MouseLeft')
    expect(mouseShortcutText({ button: 0, ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })).toBe('Win+MouseLeft')
    expect(mouseShortcutText({ button: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, new Set(['Space']))).toBe('Space+MouseLeft')
    expect(mouseShortcutText({ button: 2, ctrlKey: false, metaKey: false, altKey: true, shiftKey: false })).toBe('Alt+MouseRight')
    expect(mouseDoubleClickShortcutText({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBe('Shift+MouseDoubleLeft')
    expect(dispatchMouseShortcutInput(target, { button: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, 'keydown')).toBe(false)
    expect(dispatchMouseDoubleClickShortcutInput(target, { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe(false)
    expect(phases).toEqual(['keydown:MouseLeft', 'keydown:MouseDoubleLeft', 'keyup:MouseDoubleLeft'])
  })



  it('rebuilds blocked shortcut conflicts from persisted settings', () => {
    const shortcuts = { ...DEFAULT_SHORTCUTS, save: 'Ctrl+S', exportDocument: 'Ctrl+S' }
    const result = deriveShortcutConflicts(shortcuts)
    expect(result.blocked.exportDocument).toBe('save')
    expect(result.conflicts).toContainEqual({ shortcut: 'Ctrl+S', winner: 'save', conflicting: ['exportDocument'] })
  })








  it('imports v2 differences and legacy flat maps through the same boundary', () => {
    const v2 = importShortcutBindings(JSON.stringify({ format: 'moonsprite-shortcuts', version: 2, bindings: { save: ['F2', 'Ctrl+S'], undo: [] } }))
    const legacy = importShortcutBindings(JSON.stringify({ save: 'F3' }))

    expect(v2?.save).toEqual(['F2', 'Ctrl+S'])
    expect(v2?.undo).toEqual([])
    expect(v2?.redo).toEqual(['Ctrl+Shift+Z'])
    expect(legacy?.save).toEqual(['F3'])
    expect(legacy?.undo).toEqual(['Ctrl+Z'])
  })

})
