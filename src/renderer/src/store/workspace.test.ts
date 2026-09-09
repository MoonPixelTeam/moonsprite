import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MoonSpriteApi, StoredPalette } from '@shared/types'
import { animationMaskAt, compositeDocument, createDocument, createLayer, ensureLayerCoversCanvas, getActiveLayer, isLayerEffectivelyLocked, isLayerEffectivelyVisible, layerContentBounds, readLayerColor, readLayerColorAt, readLayerVisibleColorAt, writeLayerColor } from '@/core/document'
import { beginPixelEdit, recordPixel, revertPixelEdit } from '@/core/history'
import { packColor, relativeLuminanceColor } from '@/core/raster'
import { applySelectionTransform, applySelectionTranslationPreview, captureSelectionTransform, paintBrush, selectionTranslationPreviewEdit, type SelectionTransformSource } from '@/core/tools'
import { builtInPalettes } from '@/core/built-in-palettes'
import { createProceduralBrush } from '@/core/brushes'
import { brushLibraryLocation } from '@/core/brush-library-location'
import { addBlankAnimationFrame, animationCelAt, animationCelHasContent, animationCelKey, animationLayerAtFrame, ensureAnimationDocument, linkAnimationFrameCels, resolveAnimationCel, setAnimationCelOffsetsForKeys } from '@/core/animation'
import { buildLayerPanelTree } from '@/core/layer-panel-layout'
import { transformedSelectionBounds, transformedSelectionPivotPreset, transformSelectionMask } from '@/core/selection'
import { registerViewPreviewFlusher } from '@/core/view-preview-lifecycle'
import { beginCanvasToolGesture, endCanvasToolGesture, clearCanvasToolGestures } from '@/core/canvas-tool-gesture-lock'
import { registerPendingCanvasGestureHistory } from '@/core/canvas-input'
import { RECENT_EXPORT_PATHS_STORAGE_KEY } from '@/core/export-settings'
import { decodeProject, encodeProject, registerProjectSaveBaseline } from '@/core/project-format'
import { loadEditorPreferences, saveEditorPreferences } from '@/core/file-preferences'
import { defaultOutlineSettings } from '@/core/outline-settings'
import { LAYER_PANEL_STATE_STORAGE_KEY } from '@/core/layer-panel-state'
import { saveProgress } from '@/core/save-progress'
import { activePaintLayer } from '@/store/workspace-session'
import { repositionPaletteSlots } from '@/core/palette-layout'
import { decodePng } from '@/core/png'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import { adjustColor } from '@/core/adjustments'
import { useWorkspace } from './workspace'
import { clipboardService } from './clipboard-service'

const transparent = { r: 0, g: 0, b: 0, a: 0 }
const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 80, b: 255, a: 255 }

class MockTextCanvasContext {
  font = ''
  textBaseline: CanvasTextBaseline = 'alphabetic'
  fillStyle: string | CanvasGradient | CanvasPattern = ''
  private drawX = 0
  private drawY = 0
  measureText(text: string): TextMetrics {
    return { width: text.length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 } as TextMetrics
  }
  fillText(_text: string, x: number, y: number): void { this.drawX = Math.round(x); this.drawY = Math.round(y) }
  getImageData(_x: number, _y: number, width: number, height: number): ImageData {
    const data = new Uint8ClampedArray(width * height * 4)
    const offset = (this.drawY * width + this.drawX) * 4
    if (offset >= 0 && offset + 3 < data.length) data.set([12, 34, 56, 255], offset)
    return { data, width, height, colorSpace: 'srgb' } as ImageData
  }
}

class MockTextCanvas {
  private readonly context = new MockTextCanvasContext()
  constructor(public width: number, public height: number) {}
  getContext(): MockTextCanvasContext { return this.context }
}

const textData = (text: string, color = { r: 12, g: 34, b: 56, a: 255 }) => ({
  text,
  fontFamily: 'Consolas',
  fontSize: 16,
  lineSpacing: 0,
  letterSpacing: 0,
  spacingMode: 'font' as const,
  antialias: 'pixel' as const,
  color
})

function installApi(overrides: Partial<MoonSpriteApi> = {}): MoonSpriteApi {
  const api = {
    getResourceInfo: vi.fn(async () => ({ totalBytes: 8_000_000_000, freeBytes: 4_000_000_000 })),
    writeClipboardImage: vi.fn(async () => {}),
    writeProjectIncremental: vi.fn(async () => {}),
    readClipboardImage: vi.fn(async () => null),
    writeRecovery: vi.fn(async () => {}),
    deleteRecovery: vi.fn(async () => {}),
    ...overrides
  } as unknown as MoonSpriteApi
  Object.defineProperty(window, 'moonSprite', { configurable: true, writable: true, value: api })
  return api
}

beforeEach(() => {
  installApi()
  vi.stubGlobal('OffscreenCanvas', MockTextCanvas)
  localStorage.clear()
  brushLibraryLocation.set(null)
  saveProgress.dismiss()
  clipboardService.clearAnimation()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
})

describe('filter layer commands', () => {
  it('remembers the selection rotation algorithm across selection changes and sessions', () => {
    vi.useFakeTimers()
    try {
      const firstDocument = createDocument('rotation algorithm preference', 4, 4, 'rgba')
      useWorkspace.getState().addSession(firstDocument)
      useWorkspace.getState().setSelectionRotationAlgorithm('rotsprite')
      useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 2 })
      expect(useWorkspace.getState().sessions[0].selectionRotationAlgorithm).toBe('rotsprite')

      vi.advanceTimersByTime(100)
      const secondDocument = createDocument('rotation algorithm preference second session', 4, 4, 'rgba')
      useWorkspace.getState().addSession(secondDocument)
      expect(useWorkspace.getState().sessions[1].selectionRotationAlgorithm).toBe('rotsprite')
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses the last selected palette when creating a new document', async () => {
    const palette: StoredPalette = {
      id: 'last-used-palette',
      name: 'Last used',
      filePath: 'palettes/last-used.palette.json',
      builtIn: false,
      colors: [
        { r: 255, g: 32, b: 64, a: 255 },
        { r: 32, g: 224, b: 128, a: 255 },
        { r: 32, g: 96, b: 255, a: 255 }
      ],
      columns: 2,
      slots: [0, 1, null, 2]
    }
    localStorage.setItem('moonsprite.active-palette-id', palette.id)
    installApi({ listPalettes: vi.fn(async () => ({ directoryPath: 'palettes', palettes: [palette] })) })

    await useWorkspace.getState().newDocument('New palette project', 4, 4, 'rgba')

    const document = useWorkspace.getState().sessions[0]?.document
    expect(document?.paletteOrder.map((id) => document.palette.find((entry) => entry.id === id)?.color)).toEqual(palette.colors)
    expect(document?.paletteColumns).toBe(2)
    expect(document?.paletteSlots).toHaveLength(4)
    expect(document?.paletteSlots?.filter((id) => id === null)).toHaveLength(1)
  })

  it('creates an animated CRT filter layer with undoable structure changes', async () => {
    const document = createDocument('CRT filter', 4, 4, 'rgba')
    addBlankAnimationFrame(document)
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().applyFilterPreset('crt-scanlines-medium')

    const session = useWorkspace.getState().sessions[0]
    const filterLayer = session.document.layers.find((layer) => layer.name.includes('CRT 扫描线'))
    expect(filterLayer).toBeDefined()
    expect(filterLayer?.blendMode).toBe('soft-light')
    expect(session.document.animation?.cels.filter((cel) => cel.layerId === filterLayer?.id)).toHaveLength(2)
    expect(session.selectedLayerIds).toEqual([filterLayer?.id])

    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].document.layers.some((layer) => layer.id === filterLayer?.id)).toBe(false)
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].document.layers.some((layer) => layer.id === filterLayer?.id)).toBe(true)
  })

  it('creates an LCD Screen group from exactly one selected layer', async () => {
    const document = createDocument('LCD filter', 3, 2, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, { r: 220, g: 120, b: 40, a: 255 })
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectLayer(layer.id)

    await useWorkspace.getState().applyLcdScreenFilter()

    const session = useWorkspace.getState().sessions[0]
    const group = session.document.groups.find((candidate) => candidate.name === 'LCD屏幕滤镜')
    expect(group).toBeDefined()
    expect(session.document.layers.filter((candidate) => candidate.groupId === group?.id).map((candidate) => candidate.name)).toEqual(['红色通道', '绿色通道', '蓝色通道', '扫描线'])
    const generated = session.document.layers.filter((candidate) => candidate.groupId === group?.id)
    expect(generated.every((candidate) => (candidate.displayColor?.a ?? 0) < 255)).toBe(true)
    expect(generated.map((candidate) => candidate.displayColor)).toEqual([
      { r: 255, g: 0, b: 0, a: 64 },
      { r: 0, g: 255, b: 0, a: 64 },
      { r: 0, g: 0, b: 255, a: 64 },
      { r: 128, g: 128, b: 128, a: 64 }
    ])
    expect(generated.map((candidate) => candidate.blendMode)).toEqual(['screen', 'screen', 'screen', 'soft-light'])
    expect(generated.find((candidate) => candidate.name === '扫描线')?.blendMode).toBe('soft-light')
    expect(group?.displayColor).toBeDefined()
    expect(layer.visible).toBe(false)
    expect(session.selectedGroupId).toBe(group?.id)
    const layerIndex = session.document.layers.indexOf(layer)
    const generatedIndexes = generated.map((candidate) => session.document.layers.indexOf(candidate))
    expect(Math.min(...generatedIndexes)).toBeGreaterThan(layerIndex)

    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].document.layers.find((candidate) => candidate.id === layer.id)?.visible).toBe(true)
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].document.layers.find((candidate) => candidate.id === layer.id)?.visible).toBe(false)
  })
})

describe('outline shortcut commands', () => {
  it('uses the saved software outline color for quick outline and keeps S inside the selection', () => {
    const document = createDocument('outline shortcuts', 5, 5, 'rgba')
    const layer = document.layers[0]
    for (let y = 1; y < 4; y += 1) for (let x = 1; x < 4; x += 1) writeLayerColor(document, layer, y * layer.width + x, red)
    useWorkspace.getState().addSession(document)
    const saved = defaultOutlineSettings({ r: 0, g: 0, b: 255, a: 255 })
    saveEditorPreferences({ ...loadEditorPreferences(), outlineSettings: saved })
    useWorkspace.getState().setSelection({ x: 1, y: 1, width: 3, height: 3 })

    expect(useWorkspace.getState().quickOutlineActiveSelection()).toBe(true)
    expect(readLayerColorAt(document, layer, 0, 1)).toEqual(useWorkspace.getState().sessions[0].primaryColor)
    expect(useWorkspace.getState().outlineSelectionInside()).toBe(true)
    expect(readLayerColorAt(document, layer, 1, 1)).toEqual(useWorkspace.getState().sessions[0].primaryColor)
    expect(readLayerColorAt(document, layer, 2, 2)).toEqual(red)
  })
})

describe('automatic animation cel links', () => {
  it('stores independent layer-mask lock and auto-link settings with undo/redo', () => {
    const document = createDocument('mask settings', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(timeline, layer.id, cel.frameId)!

    const maskKey = animationCelKey(layer.id, cel.frameId)
    useWorkspace.getState().selectAnimationMaskCell(maskKey)
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBe(mask.id)
    useWorkspace.getState().setLayerMaskLocked(cel.id, true)
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBeNull()
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBe(mask.id)
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBeNull()
    useWorkspace.getState().setLayerMaskAutoLinkAnimationCels(cel.id, true)
    expect(mask.locked).toBe(true)
    expect(mask.autoLinkAnimationCels).toBe(true)
    useWorkspace.getState().undo()
    expect(mask.autoLinkAnimationCels).toBeUndefined()
    useWorkspace.getState().undo()
    expect(mask.locked).toBe(false)
    useWorkspace.getState().redo()
    expect(mask.locked).toBe(true)
  })

  it('stores the toggle per layer and supports undo/redo without affecting groups', () => {
    const document = createDocument('automatic cel link setting', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const second = createLayer('Second', 1, 1, 'rgba')
    document.layers.push(second)
    document.groups.push({ id: 'group', name: 'Group', visible: true, locked: false, opacity: 1, blendMode: 'normal' })
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, true)
    expect(layer.autoLinkAnimationCels).toBe(true)
    expect(second.autoLinkAnimationCels).toBeUndefined()
    expect(document.groups[0]).not.toHaveProperty('autoLinkAnimationCels')

    useWorkspace.getState().undo()
    expect(layer.autoLinkAnimationCels).toBeUndefined()
    useWorkspace.getState().redo()
    expect(layer.autoLinkAnimationCels).toBe(true)

    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, false)
    expect(layer.autoLinkAnimationCels).toBeUndefined()
  })

  it('uses the toggled Store state for subsequent frame creation', () => {
    const document = createDocument('automatic cel link workflow', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, true)

    const timeline = ensureAnimationDocument(document)
    const firstFrame = timeline.activeFrameId
    const secondFrame = addBlankAnimationFrame(document)
    const firstCel = animationCelAt(timeline, layer.id, firstFrame)!
    firstCel.surface!.pixels[3] = 255
    linkAnimationFrameCels(document, firstFrame, secondFrame, [layer.id])
    useWorkspace.getState().addAnimationFrame()

    const thirdFrame = ensureAnimationDocument(document).activeFrameId
    const thirdCel = animationCelAt(timeline, layer.id, thirdFrame)!
    expect(layer.autoLinkAnimationCels).toBe(true)
    expect(thirdCel.linkedCelId).toBe(firstCel.id)
  })

  it('auto-links after a real pixel edit on the active source frame', () => {
    const document = createDocument('automatic cel link painted source', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, true)

    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const firstCel = animationCelAt(timeline, layer.id, firstFrameId)!
    const edit = beginPixelEdit(layer.id)
    recordPixel(document, layer, edit, 0, packColor(red))
    useWorkspace.getState().commitPixelEdit(edit, 'paint source')

    useWorkspace.getState().addAnimationFrame()
    const secondCel = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
    expect(firstCel.surface?.pixels[3]).toBe(255)
    expect(secondCel.linkedCelId).toBe(firstCel.id)
  })

  it('auto-links the duplicate-frame toolbar path from an independent source cel', () => {
    const document = createDocument('automatic cel link duplicate path', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, true)
    const timeline = ensureAnimationDocument(document)
    const firstCel = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
    firstCel.surface!.pixels[3] = 255

    useWorkspace.getState().duplicateAnimationFrame()
    const secondCel = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
    expect(secondCel.linkedCelId).toBe(firstCel.id)
  })

  it('auto-links a new frame from an independent cel and preserves the link through undo/redo', () => {
    const document = createDocument('automatic cel link history', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, true)

    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const firstCel = animationCelAt(timeline, layer.id, firstFrameId)!
    firstCel.surface!.pixels[3] = 255

    useWorkspace.getState().addAnimationFrame()
    const secondFrameId = timeline.activeFrameId
    const secondCel = animationCelAt(timeline, layer.id, secondFrameId)!
    expect(secondCel.linkedCelId).toBe(firstCel.id)
    expect(secondCel.surface).toBe(firstCel.surface)

    useWorkspace.getState().undo()
    expect(timeline.frames.some((frame) => frame.id === secondFrameId)).toBe(false)
    expect(timeline.activeFrameId).toBe(firstFrameId)

    useWorkspace.getState().redo()
    expect(timeline.activeFrameId).toBe(secondFrameId)
    expect(animationCelAt(timeline, layer.id, secondFrameId)?.linkedCelId).toBe(firstCel.id)
  })

  it('does not auto-link a new frame when the layer toggle is off', () => {
    const document = createDocument('automatic cel link disabled', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)

    const timeline = ensureAnimationDocument(document)
    const firstCel = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
    firstCel.surface!.pixels[3] = 255
    useWorkspace.getState().addAnimationFrame()

    const secondCel = animationCelAt(timeline, layer.id, timeline.activeFrameId)!
    expect(layer.autoLinkAnimationCels).toBeUndefined()
    expect(secondCel.linkedCelId).toBeUndefined()
    expect(secondCel.surface).not.toBe(firstCel.surface)
  })

  it('auto-links frames inserted by animation-frame paste, including consecutive inserts', () => {
    const document = createDocument('automatic cel link paste', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setLayerAutoLinkAnimationCels(layer.id, true)

    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    const firstCel = animationCelAt(timeline, layer.id, firstFrameId)!
    firstCel.surface!.pixels[3] = 255
    useWorkspace.getState().selectAnimationFrame(firstFrameId)
    useWorkspace.getState().copySelectedAnimationFrames()
    useWorkspace.getState().pasteAnimationFrames()

    const insertedFrameId = timeline.activeFrameId
    const insertedCel = animationCelAt(timeline, layer.id, insertedFrameId)!
    expect(insertedFrameId).not.toBe(firstFrameId)
    expect(insertedCel.linkedCelId).toBe(firstCel.id)

    // Pasting the same clipboard again inserts after the selected frame and
    // inherits from that preceding linked cel as well.
    useWorkspace.getState().pasteAnimationFrames()
    const secondInsertedFrameId = timeline.activeFrameId
    const secondInsertedCel = animationCelAt(timeline, layer.id, secondInsertedFrameId)!
    expect(secondInsertedCel.linkedCelId).toBe(firstCel.id)
  })
})

describe('symmetry axis placement', () => {
  it('uses the canvas center only when each axis is enabled for the first time', () => {
    const document = createDocument('symmetry pointer', 16, 12, 'rgba')
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().setSymmetryCenter({ x: 3.5, y: 4.5 })
    useWorkspace.getState().setSymmetryAxis('horizontal', true)
    expect(useWorkspace.getState().sessions[0].symmetryCenter).toEqual({ x: 8, y: 6 })

    useWorkspace.getState().setSymmetryCenter({ x: 9.5, y: 8.5 })
    useWorkspace.getState().setSymmetryAxis('horizontal', false)
    useWorkspace.getState().setSymmetryAxis('horizontal', true)
    expect(useWorkspace.getState().sessions[0].symmetryCenter).toEqual({ x: 9.5, y: 8.5 })

    useWorkspace.getState().setSymmetryAxis('vertical', true)
    expect(useWorkspace.getState().sessions[0].symmetryCenter).toEqual({ x: 9.5, y: 8.5 })
  })

  it('tracks first-use placement independently for each open project', () => {
    const first = createDocument('first symmetry project', 20, 16, 'rgba')
    const second = createDocument('second symmetry project', 30, 24, 'rgba')
    useWorkspace.getState().addSession(first)
    useWorkspace.getState().addSession(second)

    useWorkspace.getState().setActive(first.id)
    useWorkspace.getState().setSymmetryCenter({ x: 2.5, y: 3.5 })
    useWorkspace.getState().setSymmetryAxis('diagonalUp', true)

    useWorkspace.getState().setActive(second.id)
    useWorkspace.getState().setSymmetryCenter({ x: 12.5, y: 13.5 })
    useWorkspace.getState().setSymmetryAxis('diagonalUp', true)

    expect(useWorkspace.getState().sessions.find((session) => session.document.id === first.id)?.symmetryCenter).toEqual({ x: 10, y: 8 })
    expect(useWorkspace.getState().sessions.find((session) => session.document.id === second.id)?.symmetryCenter).toEqual({ x: 15, y: 12 })
  })
})

describe('pending canvas gesture history', () => {
  it('consumes path undo and redo before the committed document history', () => {
    const document = createDocument('pending path history', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    let documentUndo = 0
    let documentRedo = 0
    let gestureUndo = 0
    let gestureRedo = 0
    session.history.push({
      label: 'committed edit',
      bytes: 0,
      undo: () => { documentUndo += 1 },
      redo: () => { documentRedo += 1 },
      documentChanged: false
    })
    const unregister = registerPendingCanvasGestureHistory(document.id, {
      undo: () => { gestureUndo += 1; return true },
      redo: () => { gestureRedo += 1; return true }
    })

    try {
      useWorkspace.getState().undo()
      useWorkspace.getState().redo()
      expect({ gestureUndo, gestureRedo }).toEqual({ gestureUndo: 1, gestureRedo: 1 })
      expect({ documentUndo, documentRedo }).toEqual({ documentUndo: 0, documentRedo: 0 })
      expect(session.history.canUndo).toBe(true)
    } finally {
      unregister()
    }

    useWorkspace.getState().undo()
    useWorkspace.getState().redo()
    expect({ documentUndo, documentRedo }).toEqual({ documentUndo: 1, documentRedo: 1 })
  })
})

describe('editable text layers', () => {


  it('creates, edits, converts, and restores editable text through history', () => {
    const document = createDocument('text history', 32, 24, 'rgba')
    const originalLayerId = document.activeLayerId
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().createTextLayer(textData('Moon'), 5, 7)
    let layer = getActiveLayer(document)
    let cel = animationCelAt(ensureAnimationDocument(document), layer.id, ensureAnimationDocument(document).activeFrameId)!
    const textLayerId = layer.id
    expect(layer).toMatchObject({ id: textLayerId, kind: 'text', offsetX: 5, offsetY: 7 })
    expect(cel.text).toEqual({ ...textData('Moon'), originX: 5, originY: 7 })

    useWorkspace.getState().setTextCel(textLayerId, cel.frameId, textData('Sprite'), 9, 11)
    cel = animationCelAt(ensureAnimationDocument(document), textLayerId, cel.frameId)!
    expect(cel.text?.text).toBe('Sprite')
    expect(cel.surface).toMatchObject({ offsetX: 9, offsetY: 11 })
    useWorkspace.getState().undo()
    expect(animationCelAt(ensureAnimationDocument(document), textLayerId, cel.frameId)?.text?.text).toBe('Moon')
    useWorkspace.getState().redo()
    expect(animationCelAt(ensureAnimationDocument(document), textLayerId, cel.frameId)?.text?.text).toBe('Sprite')

    useWorkspace.getState().rasterizeLayer(textLayerId)
    expect(document.layers.find((candidate) => candidate.id === textLayerId)?.kind).toBeUndefined()
    expect(animationCelAt(ensureAnimationDocument(document), textLayerId, cel.frameId)?.text).toBeUndefined()
    useWorkspace.getState().undo()
    expect(document.layers.find((candidate) => candidate.id === textLayerId)?.kind).toBe('text')
    expect(animationCelAt(ensureAnimationDocument(document), textLayerId, cel.frameId)?.text?.text).toBe('Sprite')
    useWorkspace.getState().undo()
    useWorkspace.getState().undo()
    expect(document.layers.some((candidate) => candidate.id === textLayerId)).toBe(false)
    expect(document.activeLayerId).toBe(originalLayerId)
    useWorkspace.getState().redo()
    expect(document.layers.find((candidate) => candidate.id === textLayerId)?.kind).toBe('text')
  })




})

describe('quick command content centering', () => {
  it('centers a boxed text layer by its text box and keeps editable geometry in sync', () => {
    const document = createDocument('center boxed text', 32, 24, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createTextLayer({ ...textData('Box'), boxWidth: 12, boxHeight: 8 }, 1, 2)

    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === layer.id && candidate.frameId === timeline.activeFrameId)!
    useWorkspace.getState().centerActiveContent('both')

    expect(layer.offsetX).toBe(10)
    expect(layer.offsetY).toBe(8)
    expect(cel.text).toMatchObject({ originX: 10, originY: 8, boxWidth: 12, boxHeight: 8 })
    expect(cel.surface).toMatchObject({ offsetX: 10, offsetY: 8, width: 12, height: 8 })

    useWorkspace.getState().undo()
    expect(layer.offsetX).toBe(1)
    expect(layer.offsetY).toBe(2)
    expect(cel.text).toMatchObject({ originX: 1, originY: 2 })
    useWorkspace.getState().redo()
    expect(layer.offsetX).toBe(10)
    expect(layer.offsetY).toBe(8)
  })

  it('uses the text box independently for horizontal and vertical centering', () => {
    const horizontal = createDocument('center boxed text horizontal', 32, 24, 'rgba')
    useWorkspace.getState().addSession(horizontal)
    useWorkspace.getState().createTextLayer({ ...textData('Box'), boxWidth: 12, boxHeight: 8 }, 1, 2)
    const horizontalLayer = getActiveLayer(horizontal)
    useWorkspace.getState().centerActiveContent('horizontal')
    expect(horizontalLayer.offsetX).toBe(10)
    expect(horizontalLayer.offsetY).toBe(2)

    useWorkspace.getState().undo()
    const vertical = horizontal
    const verticalLayer = getActiveLayer(vertical)
    useWorkspace.getState().centerActiveContent('vertical')
    expect(verticalLayer.offsetX).toBe(1)
    expect(verticalLayer.offsetY).toBe(8)
  })

  it('uses opaque text content bounds when no text box is present', () => {
    const document = createDocument('center unboxed text', 64, 24, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createTextLayer(textData('Text'), 1, 2)
    const layer = getActiveLayer(document)
    const before = layerContentBounds(document, layer)!
    const expectedX = before.x + Math.round(document.width / 2 - (before.x + before.width / 2))
    useWorkspace.getState().centerActiveContent('horizontal')
    const after = layerContentBounds(document, layer)!
    expect(after.x).toBe(expectedX)
    expect(Math.abs(after.x + after.width / 2 - document.width / 2)).toBeLessThanOrEqual(0.5)
    expect(after.y).toBe(before.y)
  })

  it('centers the active layer content and supports undo', () => {
    const document = createDocument('center layer content', 8, 8, 'rgba')
    const layer = getActiveLayer(document)
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) writeLayerColor(document, layer, y * layer.width + x, red)
    useWorkspace.getState().addSession(document)

    useWorkspace.getState().centerActiveContent('both')
    expect(readLayerColorAt(document, layer, 3, 3)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 4)).toEqual(red)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)

    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 3, 3)).toEqual(transparent)
  })

  it('treats a selection as one region and updates its position', () => {
    const document = createDocument('center selected content', 8, 8, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, layer.width + 1, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 2 })

    useWorkspace.getState().centerActiveContent('horizontal')
    const session = useWorkspace.getState().sessions[0]
    expect(session.selection).toMatchObject({ x: 3, y: 0, width: 2, height: 2 })
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 1)).toEqual(red)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 2, height: 2 })
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 3, y: 0, width: 2, height: 2 })
  })

  it('allows a selection nudge to move outside the canvas', () => {
    const document = createDocument('nudge selection outside canvas', 4, 2, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })

    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(-1, 0, true)

    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: -1, y: 0, width: 1, height: 1 })
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
  })

  it('preserves content moved outside the canvas before centering a selection', () => {
    const document = createDocument('center selection with off-canvas content', 8, 4, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1, red)
    writeLayerColor(document, layer, 4, blue)
    useWorkspace.getState().addSession(document)

    const selection = { x: 1, y: 0, width: 4, height: 1 }
    const source = captureSelectionTransform(document, selection, layer)!
    useWorkspace.getState().beginFloatingSelectionTransform(
      source,
      null,
      selection,
      { ...selection, x: -1 },
      false,
      'move selection outside canvas',
      null,
      { x: -1, y: 0, width: selection.width, height: selection.height },
      0,
      undefined,
      true
    )
    useWorkspace.getState().commitFloatingPaste()
    expect(readLayerColorAt(document, layer, -1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(blue)

    useWorkspace.getState().centerActiveContent('horizontal')
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 5, 0)).toEqual(blue)
  })

  it('centers a floating selection without committing or clipping its full bounds', () => {
    const document = createDocument('center pending selection', 8, 4, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1, red)
    writeLayerColor(document, layer, 4, blue)
    useWorkspace.getState().addSession(document)

    const selection = { x: 1, y: 0, width: 4, height: 1 }
    const source = captureSelectionTransform(document, selection, layer)!
    const outsideTarget = { ...selection, x: -1 }
    useWorkspace.getState().beginFloatingSelectionTransform(
      source,
      null,
      selection,
      outsideTarget,
      false,
      'floating selection move',
      null,
      outsideTarget,
      0,
      undefined,
      false
    )

    useWorkspace.getState().centerActiveContent('horizontal')
    const session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste).not.toBeNull()
    expect(session.selection).toMatchObject({ x: 2, y: 0, width: 4, height: 1 })

    useWorkspace.getState().commitFloatingPaste()
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 5, 0)).toEqual(blue)
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject(selection)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 2, y: 0, width: 4, height: 1 })
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 5, 0)).toEqual(blue)
  })

  it('centers a partially off-canvas selection on both axes and restores it exactly', () => {
    const document = createDocument('center partial selection both axes', 8, 6, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1 + layer.width * 1, red)
    writeLayerColor(document, layer, 3 + layer.width * 2, blue)
    useWorkspace.getState().addSession(document)

    const selection = { x: 1, y: 1, width: 3, height: 2 }
    const source = captureSelectionTransform(document, selection, layer)!
    const outsideTarget = { ...selection, x: -1, y: -1 }
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, outsideTarget, false, 'move outside', null, outsideTarget, 0, undefined, false)

    useWorkspace.getState().centerActiveContent('both')
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 3, y: 2, width: 3, height: 2 })
    useWorkspace.getState().commitFloatingPaste()
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(red)
    expect(readLayerColorAt(document, layer, 5, 3)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 1, 1)).toEqual(transparent)

    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, layer, 1, 1)).toEqual(red)
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 3, 2)).not.toEqual(red)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(red)
    expect(readLayerColorAt(document, layer, 5, 3)).toEqual(blue)
  })

  it('keeps one copy when a materialized selection move is centered before apply or cancel', () => {
    const document = createDocument('center materialized selection preview', 8, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 1, blue)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 1 })

    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(2, 0)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(blue)

    useWorkspace.getState().centerActiveContent('horizontal')
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)

    useWorkspace.getState().commitFloatingPaste()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)
    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(transparent)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)

    useWorkspace.getState().undo()
    useWorkspace.getState().cancelFloatingPaste()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(transparent)
  })

  it('rebuilds a clipboard preview when centering after moving its selection box', () => {
    const document = createDocument('center clipboard selection box', 8, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    const source: SelectionTransformSource = {
      selection: { x: 0, y: 0, width: 1, height: 1 },
      values: Uint32Array.from([packColor(red)]),
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets: new Uint32Array(0),
      opaqueIndices: new Uint32Array(0),
      opaqueValues: new Uint32Array(0),
      origin: 'clipboard'
    }
    const preview = applySelectionTranslationPreview(document, source, { x: 0, y: 0, width: 1, height: 1 }, true, null, layer)
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }, true, 'clipboard center', preview)
    useWorkspace.getState().commitFloatingSelectionBoxMove({ x: 0, y: 0, width: 1, height: 1 }, { x: 2, y: 0, width: 1, height: 1 }, null, null)
    useWorkspace.getState().centerActiveContent('horizontal')
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 4, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(red)

    useWorkspace.getState().commitFloatingPaste()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(red)
    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(transparent)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(red)

    useWorkspace.getState().undo()
    useWorkspace.getState().cancelFloatingPaste()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(transparent)
  })

  it('restores the original canvas when canceling a centered clipboard box move', () => {
    const document = createDocument('cancel centered clipboard selection box', 8, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    const source: SelectionTransformSource = {
      selection: { x: 0, y: 0, width: 1, height: 1 },
      values: Uint32Array.from([packColor(red)]),
      selectedOffsets: new Uint32Array(0),
      opaqueOffsets: new Uint32Array(0),
      opaqueIndices: new Uint32Array(0),
      opaqueValues: new Uint32Array(0),
      origin: 'clipboard'
    }
    const preview = applySelectionTranslationPreview(document, source, { x: 0, y: 0, width: 1, height: 1 }, true, null, layer)
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }, true, 'clipboard cancel center', preview)
    useWorkspace.getState().commitFloatingSelectionBoxMove({ x: 0, y: 0, width: 1, height: 1 }, { x: 2, y: 0, width: 1, height: 1 }, null, null)
    useWorkspace.getState().centerActiveContent('horizontal')
    useWorkspace.getState().cancelFloatingPaste()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    for (let x = 0; x < document.width; x += 1) expect(readLayerColorAt(document, layer, x, 0)).toEqual(transparent)
  })

  it('keeps deferred off-canvas selection centering out of document pixels until apply', () => {
    const document = createDocument('deferred gif selection center', 8, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1, red)
    writeLayerColor(document, layer, 2, blue)
    useWorkspace.getState().addSession(document)
    const before = { x: 1, y: 0, width: 2, height: 1 }
    const source = captureSelectionTransform(document, before, layer, { preserveOutsideCanvas: true })!
    const outside = { ...before, x: -1 }
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, before, outside, false, 'deferred center', null, outside, 0, undefined, true)
    useWorkspace.getState().centerActiveContent('horizontal')
    const session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste?.previewDeferred).toBe(true)
    expect(session.pendingPaste?.translationPreview).toBeNull()
    expect(session.pendingPaste?.previewEdit).toBeNull()
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(transparent)

    useWorkspace.getState().commitFloatingPaste()
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)
    useWorkspace.getState().undo()
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(blue)
    useWorkspace.getState().redo()
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)
  })

  it('cancels deferred off-canvas centering without leaving a target ghost', () => {
    const document = createDocument('cancel deferred gif selection center', 8, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1, red)
    writeLayerColor(document, layer, 2, blue)
    useWorkspace.getState().addSession(document)
    const before = { x: 1, y: 0, width: 2, height: 1 }
    const source = captureSelectionTransform(document, before, layer, { preserveOutsideCanvas: true })!
    const outside = { ...before, x: -1 }
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, before, outside, false, 'deferred cancel center', null, outside, 0, undefined, true)
    useWorkspace.getState().centerActiveContent('horizontal')
    useWorkspace.getState().cancelFloatingPaste()
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(transparent)
  })
})

describe('layer masks', () => {
  it('switches to mask colors and fills a selected mask area on delete', () => {
    const document = createDocument('mask delete', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const cel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setPrimaryColor(red)
    useWorkspace.getState().setSecondaryColor(blue)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(ensureAnimationDocument(document), layer.id, cel.frameId)!
    let session = useWorkspace.getState().sessions[0]
    expect(session.primaryColor).toEqual({ r: 255, g: 255, b: 255, a: 255 })
    expect(session.secondaryColor).toEqual({ r: 0, g: 0, b: 0, a: 255 })
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().deleteSelection()
    expect(readLayerColor(document, mask, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 })
    useWorkspace.getState().selectLayer(layer.id)
    session = useWorkspace.getState().sessions[0]
    expect(session.primaryColor).toEqual(red)
    expect(session.secondaryColor).toEqual(blue)
  })

  it('creates, edits, deletes, and restores a mask owned by one animation cell', () => {
    const document = createDocument('mask history', 1, 1, 'rgba')
    getActiveLayer(document).pixels[3] = 255
    const cel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(ensureAnimationDocument(document), cel.layerId, cel.frameId)!
    const maskKey = animationCelKey(cel.layerId, cel.frameId)
    useWorkspace.getState().selectAnimationMaskCell(maskKey)
    expect(readLayerColor(document, mask, 0)).toEqual(transparent)
    expect(useWorkspace.getState().sessions[0]).toMatchObject({ activeLayerMaskId: mask.id, layerMaskIsolatedView: false })
    const edit = beginPixelEdit(mask.id)
    recordPixel(document, mask, edit, 0, packColor({ r: 255, g: 0, b: 0, a: 255 }))

    useWorkspace.getState().commitPixelEdit(edit, 'paint mask')
    let session = useWorkspace.getState().sessions[0]
    expect(session.activeLayerMaskId).toBe(mask.id)
    expect(session.selectedAnimationMaskCellKeys).toEqual([maskKey])
    expect(readLayerColor(document, mask, 0)).toEqual({ r: 54, g: 54, b: 54, a: 255 })
    expect(session.contentInvalidation).toMatchObject({ kind: 'region', frameId: cel.frameId })

    useWorkspace.getState().undo()
    expect(readLayerColor(document, mask, 0)).toEqual(transparent)
    useWorkspace.getState().redo()
    expect(readLayerColor(document, mask, 0)).toEqual({ r: 54, g: 54, b: 54, a: 255 })

    useWorkspace.getState().deleteLayerMask(cel.id)
    expect(animationMaskAt(ensureAnimationDocument(document), cel.layerId, cel.frameId)).toBeNull()
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBeNull()
    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(animationMaskAt(ensureAnimationDocument(document), cel.layerId, cel.frameId)?.id).toBe(mask.id)
    expect(session.activeLayerMaskId).toBe(mask.id)
  })

  it('preserves custom mask paint colors when undo restores the mask context', () => {
    const document = createDocument('mask undo colors', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const cel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setPrimaryColor(red)
    useWorkspace.getState().setSecondaryColor(blue)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(ensureAnimationDocument(document), cel.layerId, cel.frameId)!
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(cel.layerId, cel.frameId))

    const customPrimary = { r: 0, g: 0, b: 0, a: 255 }
    const customSecondary = { r: 255, g: 255, b: 0, a: 255 }
    useWorkspace.getState().setPrimaryColor(customPrimary)
    useWorkspace.getState().setSecondaryColor(customSecondary)
    const edit = beginPixelEdit(mask.id)
    recordPixel(document, mask, edit, 0, packColor(customPrimary))
    useWorkspace.getState().commitPixelEdit(edit, 'paint mask with custom color')

    useWorkspace.getState().undo()
    const session = useWorkspace.getState().sessions[0]
    expect(session.activeLayerMaskId).toBe(mask.id)
    expect(session.primaryColor).toEqual(customPrimary)
    expect(session.secondaryColor).toEqual(customSecondary)
  })

  it('moves a bound mask with its animation cel and restores both through history', () => {
    const document = createDocument('mask movement', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const cel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    useWorkspace.getState().selectLayer(layer.id)
    const mask = animationMaskAt(ensureAnimationDocument(document), layer.id, cel.frameId)!
    const key = animationCelKey(layer.id, cel.frameId)
    const move = {
      layerId: layer.id,
      layerIds: [layer.id],
      layerOffset: { x: 0, y: 0 },
      layerOffsets: { [layer.id]: { x: 0, y: 0 } },
      layerPreviewOffset: { x: 0, y: 0 },
      layerFrameId: cel.frameId,
      animationCellKeys: [key],
      animationCellOffsets: { [key]: { x: 0, y: 0 } },
      selectionStart: null
    }
    useWorkspace.getState().previewLayerMove(document.id, move, 0, 0)
    expect(cel.surface?.offsetX).toBe(0)
    useWorkspace.getState().previewLayerMove(document.id, move, 1, 0)
    expect(cel.surface?.offsetX).toBe(1)
    expect(mask.offsetX).toBe(1)
    useWorkspace.getState().commitLayerMove(document.id, move)
    useWorkspace.getState().undo()
    expect(cel.surface?.offsetX).toBe(0)
    expect(mask.offsetX).toBe(0)
    useWorkspace.getState().redo()
    expect(cel.surface?.offsetX).toBe(1)
    expect(mask.offsetX).toBe(1)
  })

  it('keeps the owning layer active when painting after leaving mask mode', () => {
    const document = createDocument('mask owner paint context', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(timeline, layer.id, cel.frameId)!
    const key = animationCelKey(layer.id, cel.frameId)
    const initialActiveLayerId = document.activeLayerId
    useWorkspace.getState().selectAnimationMaskCell(key)
    expect(useWorkspace.getState().sessions[0].activeLayerMaskId).toBe(mask.id)
    expect(document.activeLayerId).toBe(initialActiveLayerId)
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([])
    expect(useWorkspace.getState().sessions[0].selectedGroupIds).toEqual([])

    useWorkspace.getState().selectLayer(layer.id)
    const edit = beginPixelEdit(layer.id)
    recordPixel(document, layer, edit, 0, packColor(red))
    useWorkspace.getState().commitPixelEdit(edit, 'paint owner layer')

    const session = useWorkspace.getState().sessions[0]
    expect(document.activeLayerId).toBe(layer.id)
    expect(session.activeLayerMaskId).toBeNull()
    expect(session.layerMaskIsolatedView).toBe(false)
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(activePaintLayer(session)).toBe(layer)

    useWorkspace.getState().undo()
    expect(session.activeLayerMaskId).toBeNull()
    expect(activePaintLayer(session)).toBe(layer)
    useWorkspace.getState().redo()
    expect(session.activeLayerMaskId).toBeNull()
    expect(activePaintLayer(session)).toBe(layer)
  })

  it('clears mask and timeline selection when clicking the owning layer row', () => {
    const document = createDocument('layer row clears mask context', 1, 1, 'rgba')
    const ownerLayer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === ownerLayer.id && candidate.frameId === timeline.activeFrameId)!
    ownerLayer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)

    const session = useWorkspace.getState().sessions[0]!
    const frameId = timeline.activeFrameId
    const celKey = animationCelKey(ownerLayer.id, frameId)
    const maskId = animationMaskAt(timeline, ownerLayer.id, frameId)!.id
    session.selectedAnimationMaskRowKeys = [`layer:${ownerLayer.id}`]
    session.selectedAnimationMaskCellKeys = [celKey]
    session.activeLayerMaskId = maskId
    session.selectedAnimationFrameIds = [frameId]
    session.selectedAnimationCellKeys = [celKey]
    session.animationFrameSelectionAnchorId = frameId
    session.animationMaskCellSelectionAnchorKey = celKey
    session.animationCellSelectionAnchorKey = celKey
    session.document.activeLayerId = ownerLayer.id
    timeline.activeFrameId = frameId
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })

    useWorkspace.getState().selectLayer(ownerLayer.id)

    const nextSession = useWorkspace.getState().sessions[0]!
    expect(nextSession.selectedAnimationMaskRowKeys).toEqual([])
    expect(nextSession.selectedAnimationMaskCellKeys).toEqual([])
    expect(nextSession.activeLayerMaskId).toBeNull()
    expect(nextSession.layerMaskIsolatedView).toBe(false)
    expect(nextSession.selectedLayerIds).toEqual([ownerLayer.id])
    expect(nextSession.selectedAnimationFrameIds).toEqual([])
    expect(nextSession.selectedAnimationCellKeys).toEqual([])
    expect(nextSession.document.activeLayerId).toBe(ownerLayer.id)
    expect(ensureAnimationDocument(nextSession.document).activeFrameId).toBe(frameId)
  })

  it('leaves no mask-row visual context after selecting its owning layer', () => {
    const document = createDocument('mask row to owner layer', 1, 1, 'rgba')
    const ownerLayer = getActiveLayer(document)
    ownerLayer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels.find((candidate) => candidate.layerId === ownerLayer.id && candidate.frameId === timeline.activeFrameId)!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)

    const frameId = timeline.activeFrameId
    useWorkspace.getState().selectAnimationMaskRow('layer', ownerLayer.id)
    const session = useWorkspace.getState().sessions[0]!
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${ownerLayer.id}`])
    expect(session.selectedLayerIds).toEqual([])

    // Simulate the stale active-mask target that can survive until the next
    // render while the mask row is still the formal selection.
    session.activeLayerMaskId = animationMaskAt(timeline, ownerLayer.id, frameId)!.id
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })
    useWorkspace.getState().selectLayer(ownerLayer.id)

    const nextSession = useWorkspace.getState().sessions[0]!
    expect(nextSession.selectedAnimationMaskRowKeys).toEqual([])
    expect(nextSession.selectedAnimationMaskCellKeys).toEqual([])
    expect(nextSession.activeLayerMaskId).toBeNull()
    expect(nextSession.layerMaskIsolatedView).toBe(false)
    expect(nextSession.selectedLayerIds).toEqual([ownerLayer.id])
    expect(nextSession.document.activeLayerId).toBe(ownerLayer.id)
    expect(ensureAnimationDocument(nextSession.document).activeFrameId).toBe(frameId)
  })

  it('keeps mask-row selection separate from mask-cell selection', () => {
    const document = createDocument('mask row cell selection', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const mask = animationMaskAt(timeline, layer.id, cel.frameId)!

    useWorkspace.getState().selectAnimationMaskRow('layer', layer.id)
    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${layer.id}`])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([])
    expect(session.selectedGroupIds).toEqual([])
    expect(session.activeLayerMaskId).toBeNull()

    const key = animationCelKey(layer.id, cel.frameId)
    useWorkspace.getState().selectAnimationMaskCell(key)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationMaskRowKeys).toEqual([])
    expect(session.selectedAnimationMaskCellKeys).toEqual([key])
    expect(session.activeLayerMaskId).toBe(mask.id)
    expect(session.selectedLayerIds).toEqual([])
  })

  it('allows a mask row and ordinary layer rows to be multi-selected', async () => {
    const document = createDocument('mixed layer and mask row selection', 1, 1, 'rgba')
    const firstLayer = getActiveLayer(document)
    firstLayer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    await useWorkspace.getState().addLayer()

    const secondLayer = useWorkspace.getState().sessions[0]!.document.layers.find((layer) => layer.id !== firstLayer.id)!
    useWorkspace.getState().selectLayer(firstLayer.id)
    useWorkspace.getState().selectAnimationMaskRow('layer', firstLayer.id, 'toggle')

    let session = useWorkspace.getState().sessions[0]!
    expect(session.selectedLayerIds).toEqual([firstLayer.id])
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${firstLayer.id}`])

    useWorkspace.getState().selectLayer(secondLayer.id, 'toggle')
    session = useWorkspace.getState().sessions[0]!
    expect(session.selectedLayerIds).toEqual([firstLayer.id, secondLayer.id])
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${firstLayer.id}`])
    expect(session.layerSelectionExplicit).toBe(true)
  })

  it('keeps mask rows in shift ranges with ordinary layer rows', async () => {
    const document = createDocument('shift range across mask row', 1, 1, 'rgba')
    const firstLayer = getActiveLayer(document)
    firstLayer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(timeline.cels[0]!.id)
    await useWorkspace.getState().addLayer()

    const secondLayer = useWorkspace.getState().sessions[0]!.document.layers.find((layer) => layer.id !== firstLayer.id)!
    useWorkspace.getState().selectLayer(firstLayer.id)
    useWorkspace.getState().selectAnimationMaskRow('layer', firstLayer.id, 'range')

    let session = useWorkspace.getState().sessions[0]!
    expect(session.selectedLayerIds).toEqual([firstLayer.id])
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${firstLayer.id}`])

    useWorkspace.getState().selectLayer(secondLayer.id, 'range')
    session = useWorkspace.getState().sessions[0]!
    expect(session.selectedLayerIds).toEqual([secondLayer.id])
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${firstLayer.id}`])
  })

  it('keeps the first active frame when adding another mask cell to the selection', () => {
    const document = createDocument('mask multi-cell activity', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    const firstFrameId = ensureAnimationDocument(document).activeFrameId
    const firstCel = animationCelAt(ensureAnimationDocument(document), layer.id, firstFrameId)!
    useWorkspace.getState().createLayerMask(firstCel.id)
    useWorkspace.getState().duplicateAnimationFrame()

    const session = useWorkspace.getState().sessions[0]!
    const timeline = ensureAnimationDocument(session.document)
    const secondFrameId = timeline.frames.find((frame) => frame.id !== firstFrameId)!.id
    const secondCel = animationCelAt(timeline, layer.id, secondFrameId)!
    if (!animationMaskAt(timeline, layer.id, secondFrameId)) useWorkspace.getState().createLayerMask(secondCel.id)
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, secondFrameId))
    useWorkspace.getState().selectAnimationMaskCell(animationCelKey(layer.id, firstFrameId), 'toggle')

    const next = useWorkspace.getState().sessions[0]!
    expect(next.selectedAnimationMaskCellKeys).toEqual([
      animationCelKey(layer.id, secondFrameId),
      animationCelKey(layer.id, firstFrameId)
    ])
    expect(ensureAnimationDocument(next.document).activeFrameId).toBe(firstFrameId)
  })

  it('keeps the selected mask row active when selecting an animation frame', () => {
    const document = createDocument('mask row frame selection', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const activeLayerBefore = document.activeLayerId

    useWorkspace.getState().selectAnimationMaskRow('layer', layer.id)
    const sessionDocument = useWorkspace.getState().sessions[0].document
    const sessionTimeline = ensureAnimationDocument(sessionDocument)
    sessionTimeline.frames.push({ id: 'mask-row-frame-2', duration: sessionTimeline.frames[0]?.duration ?? 100 })
    const nextFrame = sessionTimeline.frames[1]!
    useWorkspace.getState().selectAnimationFrame(nextFrame.id)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${layer.id}`])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(session.selectedAnimationFrameIds).toEqual([nextFrame.id])
    expect(session.selectedLayerIds).toEqual([])
    expect(session.activeLayerMaskId).toBeNull()
    expect(document.activeLayerId).toBe(activeLayerBefore)
  })

  it('keeps the active mask target when selecting a frame from a mask cell', () => {
    const document = createDocument('mask cell frame selection', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    const key = animationCelKey(layer.id, cel.frameId)
    useWorkspace.getState().selectAnimationMaskCell(key)
    const sessionDocument = useWorkspace.getState().sessions[0].document
    const sessionTimeline = ensureAnimationDocument(sessionDocument)
    sessionTimeline.frames.push({ id: 'mask-cell-frame-2', duration: sessionTimeline.frames[0]?.duration ?? 100 })
    const nextFrame = sessionTimeline.frames[1]!
    const activeMaskId = useWorkspace.getState().sessions[0].activeLayerMaskId
    const activeLayerBefore = sessionDocument.activeLayerId

    useWorkspace.getState().selectAnimationFrame(nextFrame.id)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationMaskRowKeys).toEqual([`layer:${layer.id}`])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(session.selectedAnimationFrameIds).toEqual([nextFrame.id])
    expect(session.activeLayerMaskId).toBe(activeMaskId)
    expect(sessionDocument.activeLayerId).toBe(activeLayerBefore)
  })

  it('does not expose fully masked layer pixels to visible-pixel reads', () => {
    const document = createDocument('mask hit test', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    const cel = ensureAnimationDocument(document).cels[0]
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().createLayerMask(cel.id)
    animationMaskAt(ensureAnimationDocument(document), layer.id, cel.frameId)!.pixels.set([0, 0, 0, 255])
    expect(readLayerVisibleColorAt(document, layer, 0, 0).a).toBe(0)
  })
})

describe('animation workspace', () => {

  it('commits a floating selection to its source frame before switching and keeps the selection for the next frame', () => {
    const document = createDocument('selection across frames', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [first, second] = timeline.frames
    ensureLayerCoversCanvas(document, layer)
    writeLayerColor(document, layer, 1, blue)
    useWorkspace.getState().setActiveAnimationFrame(first.id)

    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0)
    expect(useWorkspace.getState().sessions[0].pendingPaste).not.toBeNull()

    useWorkspace.getState().setActiveAnimationFrame(second.id)

    let session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste).toBeNull()
    expect(session.selection).toEqual({ x: 1, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, first.id)!, 0, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, first.id)!, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, second.id)!, 1, 0)).toEqual(blue)

    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0)
    useWorkspace.getState().commitFloatingPaste()
    session = useWorkspace.getState().sessions[0]
    expect(session.selection).toEqual({ x: 2, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, second.id)!, 1, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, second.id)!, 2, 0)).toEqual(blue)

    useWorkspace.getState().setActiveAnimationFrame(first.id)
    useWorkspace.getState().setSelection({ x: 1, y: 0, width: 1, height: 1 })
    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0)
    useWorkspace.getState().stepAnimationFrame(1)
    session = useWorkspace.getState().sessions[0]
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second.id)
    expect(session.pendingPaste).toBeNull()
    expect(session.selection).toEqual({ x: 2, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, first.id)!, 1, 0)).toEqual(transparent)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, first.id)!, 2, 0)).toEqual(red)
  })

  it('commits a floating selection before playback and preserves its geometry while frames advance', () => {
    const document = createDocument('selection during playback', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().addAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [first, second] = timeline.frames
    ensureLayerCoversCanvas(document, layer)
    writeLayerColor(document, layer, 1, blue)
    useWorkspace.getState().setActiveAnimationFrame(first.id)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0)

    useWorkspace.getState().setAnimationPlaying(true)
    let session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste).toBeNull()
    expect(session.selection).toEqual({ x: 1, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, first.id)!, 1, 0)).toEqual(red)

    useWorkspace.getState().advanceAnimationFrame()
    session = useWorkspace.getState().sessions[0]
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second.id)
    expect(session.selection).toEqual({ x: 1, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, animationLayerAtFrame(document, layer.id, second.id)!, 1, 0)).toEqual(blue)
    useWorkspace.getState().setAnimationPlaying(false)
    expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 1, y: 0, width: 1, height: 1 })
  })

  it('uses the layer setting to control skipping disabled frames while stepping', () => {
    const document = createDocument('manual disabled frame stepping', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [first, second, third] = timeline.frames
    second!.disabled = true
    useWorkspace.getState().setActiveAnimationFrame(first!.id)

    useWorkspace.getState().stepAnimationFrame(1)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(third!.id)

    saveEditorPreferences({ ...loadEditorPreferences(), skipDisabledFrames: false })
    useWorkspace.getState().stepAnimationFrame(-1)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second!.id)
  })

  it('preserves timeline multi-selection while playback advances and stops', () => {
    const document = createDocument('playback selection', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()

    const timeline = ensureAnimationDocument(document)
    const [first, second] = timeline.frames
    useWorkspace.getState().selectAnimationFrame(first.id)
    useWorkspace.getState().selectAnimationFrame(second.id, 'toggle')
    useWorkspace.getState().setAnimationLoop(true)

    useWorkspace.getState().setAnimationPlaying(true)
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([first.id, second.id])
    useWorkspace.getState().advanceAnimationFrame()

    let session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([first.id, second.id])
    expect(ensureAnimationDocument(session.document).activeFrameId).toBe(first.id)
    expect(session.selectedAnimationCellKeys).toEqual([])

    useWorkspace.getState().setAnimationPlaying(false)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationFrameIds).toEqual([first.id, second.id])
  })

  it('rejects moving inherited linked mask members instead of silently doing nothing', () => {
    const document = createDocument('linked mask move', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    layer.pixels[3] = 255
    useWorkspace.getState().addSession(document)
    const timeline = ensureAnimationDocument(document)
    const sourceCel = timeline.cels[0]!
    useWorkspace.getState().createLayerMask(sourceCel.id)
    const sourceMask = animationMaskAt(timeline, layer.id, sourceCel.frameId)!
    sourceMask.autoLinkAnimationCels = true
    useWorkspace.getState().duplicateAnimationFrame()
    const targetFrame = timeline.frames[1]!
    const linkedMask = timeline.layerMasks?.find((entry) => entry.layerId === layer.id && entry.frameId === targetFrame.id)?.mask
    expect(linkedMask?.linkedMaskId).toBe(sourceMask.id)
    const linkedKey = animationCelKey(layer.id, targetFrame.id)
    useWorkspace.getState().selectAnimationMaskCell(linkedKey)
    expect(useWorkspace.getState().sessions[0].selectedAnimationMaskCellKeys).toEqual([linkedKey])

    useWorkspace.getState().moveSelectedAnimationMasks(layer.id, sourceCel.frameId, linkedKey)

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(useWorkspace.getState().message).toBeTruthy()
    expect(animationMaskAt(timeline, layer.id, sourceCel.frameId)).toBe(sourceMask)
  })

  it('keeps a white source mask slot when moving mask content across layers', () => {
    const document = createDocument('move animation mask across layers', 1, 1, 'rgba')
    const sourceLayer = getActiveLayer(document)
    const targetLayer = createLayer('Target', 1, 1, 'rgba')
    document.layers.push(targetLayer)
    sourceLayer.pixels[3] = 255
    targetLayer.pixels[3] = 255
    useWorkspace.getState().addSession(document)

    const timeline = ensureAnimationDocument(document)
    const sourceCel = animationCelAt(timeline, sourceLayer.id, timeline.activeFrameId)!
    const targetCel = animationCelAt(timeline, targetLayer.id, timeline.activeFrameId)!
    useWorkspace.getState().createLayerMask(sourceCel.id)
    useWorkspace.getState().createLayerMask(targetCel.id)
    const sourceMask = animationMaskAt(timeline, sourceLayer.id, sourceCel.frameId)!
    const targetMask = animationMaskAt(timeline, targetLayer.id, targetCel.frameId)!
    sourceMask.pixels.set([12, 12, 12, 255])

    const sourceKey = animationCelKey(sourceLayer.id, sourceCel.frameId)
    const targetKey = animationCelKey(targetLayer.id, targetCel.frameId)
    useWorkspace.getState().selectAnimationMaskCell(sourceKey)
    useWorkspace.getState().moveSelectedAnimationMasks(targetLayer.id, targetCel.frameId, sourceKey)

    const movedSourceMask = animationMaskAt(timeline, sourceLayer.id, sourceCel.frameId)!
    const movedTargetMask = animationMaskAt(timeline, targetLayer.id, targetCel.frameId)!
    expect(Array.from(movedSourceMask.pixels)).toEqual([255, 255, 255, 255])
    expect(Array.from(movedTargetMask.pixels)).toEqual([12, 12, 12, 255])
    expect(movedSourceMask.id).not.toBe(movedTargetMask.id)
    expect(targetMask.id).not.toBe(movedTargetMask.id)
    expect(useWorkspace.getState().sessions[0].selectedAnimationMaskCellKeys).toEqual([targetKey])
    expect(useWorkspace.getState().sessions[0].document.activeLayerId).toBe(targetLayer.id)
    expect(useWorkspace.getState().sessions[0].document.animation?.activeFrameId).toBe(targetCel.frameId)
  })

  it('keeps moved multi-cel selection and restores it through undo/redo', () => {
    const document = createDocument('move selected animation cels', 2, 1, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 2, 1, 'rgba')
    document.layers.push(top)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const [first, second, third] = timeline.frames
    const sourceKeys = [animationCelKey(bottom.id, first.id), animationCelKey(top.id, second.id)]
    useWorkspace.getState().selectAnimationCell(sourceKeys[0])
    useWorkspace.getState().selectAnimationCell(sourceKeys[1], 'toggle')
    expect(useWorkspace.getState().sessions[0].selectedAnimationCellKeys).toEqual(sourceKeys)

    useWorkspace.getState().moveSelectedAnimationCels(bottom.id, second.id, sourceKeys[0])
    let session = useWorkspace.getState().sessions[0]
    const targetKeys = [animationCelKey(bottom.id, second.id), animationCelKey(top.id, third.id)]
    expect(session.selectedAnimationCellKeys).toEqual(targetKeys)
    expect(session.animationCellSelectionAnchorKey).toBe(targetKeys[0])
    expect(session.document.activeLayerId).toBe(bottom.id)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second.id)

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual(sourceKeys)
    expect(session.animationCellSelectionAnchorKey).toBe(sourceKeys[1])
    expect(session.document.activeLayerId).toBe(top.id)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second.id)

    useWorkspace.getState().redo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual(targetKeys)
    expect(session.animationCellSelectionAnchorKey).toBe(targetKeys[0])
    expect(session.document.activeLayerId).toBe(bottom.id)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(second.id)
  })

  it('keeps timeline and canvas selection guides after mirroring selected cels', () => {
    const document = createDocument('mirror selected animation cels', 2, 1, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 2, 1, 'rgba')
    document.layers.push(top)
    writeLayerColor(document, bottom, 0, red)
    writeLayerColor(document, top, 1, blue)
    useWorkspace.getState().addSession(document)
    const frameId = ensureAnimationDocument(document).activeFrameId
    const selectedKeys = [animationCelKey(bottom.id, frameId), animationCelKey(top.id, frameId)]
    useWorkspace.getState().selectAnimationCell(selectedKeys[0])
    useWorkspace.getState().selectAnimationCell(selectedKeys[1], 'toggle')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 1 })

    useWorkspace.getState().flipActiveSelection('horizontal')

    const session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual(selectedKeys)
    expect(session.selection).toMatchObject({ x: 0, y: 0, width: 2, height: 1 })
    expect(session.selectionGuidesPreservedAtContentRevision).toBe(session.contentRevision)
  })

  it('returns to the active layer and frame when deselecting a transformed multi-selection', () => {
    const document = createDocument('deselect transformed multi-selection', 2, 1, 'rgba')
    const activeLayer = getActiveLayer(document)
    const otherLayer = createLayer('Other', 2, 1, 'rgba')
    document.layers.push(otherLayer)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()

    const timeline = ensureAnimationDocument(document)
    const activeFrameId = timeline.activeFrameId
    const selectedKeys = [
      animationCelKey(activeLayer.id, activeFrameId),
      animationCelKey(otherLayer.id, activeFrameId)
    ]
    useWorkspace.getState().selectAnimationCell(selectedKeys[0])
    useWorkspace.getState().selectAnimationCell(selectedKeys[1], 'toggle')

    const session = useWorkspace.getState().sessions[0]
    document.activeLayerId = activeLayer.id
    session.selection = { x: 0, y: 0, width: 1, height: 1 }
    session.selectionGuidesPreservedAtContentRevision = session.contentRevision

    useWorkspace.getState().commitSelectionChange(
      { ...session.selection },
      null,
      'deselect transformed selection',
      { resetTimelineSelection: true }
    )

    expect(session.selection).toBeNull()
    expect(session.selectedAnimationFrameIds).toEqual([])
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedAnimationMaskCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([activeLayer.id])
    expect(session.selectedGroupIds).toEqual([])
    expect(document.activeLayerId).toBe(activeLayer.id)
    expect(timeline.activeFrameId).toBe(activeFrameId)

    useWorkspace.getState().undo()
    expect(session.selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([activeLayer.id])

    useWorkspace.getState().redo()
    expect(session.selection).toBeNull()
    expect(session.selectedAnimationCellKeys).toEqual([])
    expect(session.selectedLayerIds).toEqual([activeLayer.id])
  })

  it('tracks first paint on the initial animation cel for timeline rendering', () => {
    const document = createDocument('first paint timeline', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().addSession(document)
    let session = useWorkspace.getState().sessions[0]!
    const before = { revision: session.revision, contentRevision: session.contentRevision, layersPanelRevision: session.layersPanelRevision, activeLayerId: document.activeLayerId, activeFrameId: timeline.activeFrameId }
    const edit = beginPixelEdit(layer.id)
    recordPixel(document, layer, edit, 0, packColor(red))
    useWorkspace.getState().commitPixelEdit(edit, 'first paint')
    session = useWorkspace.getState().sessions[0]!
    expect(session.revision).toBe(before.revision + 1)
    expect(session.contentRevision).toBe(before.contentRevision + 1)
    expect(session.layersPanelRevision).toBe(before.layersPanelRevision)
    expect(session.history.position).toBe(1)
    expect(readLayerColor(document, layer, 0)).toEqual(red)
    expect(cel.surface?.pixels?.[3] ?? layer.pixels[3]).toBe(255)
    expect(document.activeLayerId).toBe(layer.id)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(before.activeFrameId)
  })

  it('restores animation and active selection context around pixel history', () => {
    const document = createDocument('pixel selection history', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    const initialTimeline = ensureAnimationDocument(document)
    const frameId = initialTimeline.activeFrameId
    useWorkspace.getState().addSession(document)
    let timeline = ensureAnimationDocument(document)
    const cel = timeline.cels[0]!
    useWorkspace.getState().createLayerMask(cel.id)

    let session = useWorkspace.getState().sessions[0]
    session.history.clear()
    const celKey = animationCelKey(layer.id, frameId)
    timeline = ensureAnimationDocument(document)
    const mask = animationMaskAt(timeline, layer.id, frameId)!
    session.selectedLayerIds = [layer.id]
    session.selectedGroupId = null
    session.selectedGroupIds = []
    session.selectedAnimationFrameIds = [frameId]
    session.animationFrameSelectionAnchorId = frameId
    session.selectedAnimationCellKeys = [celKey]
    session.animationCellSelectionAnchorKey = celKey
    session.animationCellSelectionExplicit = true
    session.selectedAnimationMaskCellKeys = [celKey]
    session.animationMaskCellSelectionAnchorKey = celKey
    session.document.activeLayerId = layer.id
    timeline.activeFrameId = frameId
    session.activeLayerMaskId = mask.id
    session.layerMaskIsolatedView = true

    const edit = beginPixelEdit(layer.id)
    recordPixel(document, layer, edit, 0, packColor(blue))
    useWorkspace.getState().commitPixelEdit(edit, 'paint with selection')
    session = useWorkspace.getState().sessions[0]
    expect(session.history.position).toBe(1)

    session.selectedLayerIds = []
    session.selectedAnimationFrameIds = []
    session.selectedAnimationCellKeys = []
    session.selectedAnimationMaskCellKeys = []
    session.activeLayerMaskId = null
    session.layerMaskIsolatedView = false
    useWorkspace.setState({ sessions: [...useWorkspace.getState().sessions] })

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(readLayerColor(document, layer, 0)).toEqual(red)
    expect(session.selectedLayerIds).toEqual([layer.id])
    expect(session.selectedAnimationFrameIds).toEqual([frameId])
    expect(session.animationFrameSelectionAnchorId).toBe(frameId)
    expect(session.selectedAnimationCellKeys).toEqual([celKey])
    expect(session.animationCellSelectionAnchorKey).toBe(celKey)
    expect(session.animationCellSelectionExplicit).toBe(true)
    expect(session.selectedAnimationMaskCellKeys).toEqual([celKey])
    expect(session.animationMaskCellSelectionAnchorKey).toBe(celKey)
    expect(session.document.activeLayerId).toBe(layer.id)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(frameId)
    expect(session.activeLayerMaskId).toBe(mask.id)
    expect(session.layerMaskIsolatedView).toBe(true)

    useWorkspace.getState().redo()
    expect(readLayerColor(document, layer, 0)).toEqual(blue)
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedAnimationCellKeys).toEqual([celKey])
    expect(session.selectedAnimationMaskCellKeys).toEqual([celKey])
    expect(session.activeLayerMaskId).toBe(mask.id)
    expect(session.layerMaskIsolatedView).toBe(true)
  })

  it('deletes selected animation frames as one undoable action', () => {
    const document = createDocument('delete selected animation frames', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    useWorkspace.getState().duplicateAnimationFrame()
    const timeline = ensureAnimationDocument(document)
    const originalFrameIds = timeline.frames.map((frame) => frame.id)

    useWorkspace.getState().selectAnimationFrame(originalFrameIds[0])
    useWorkspace.getState().selectAnimationFrame(originalFrameIds[1], 'range')
    useWorkspace.getState().deleteSelectedAnimationItems()

    expect(timeline.frames.map((frame) => frame.id)).toEqual([originalFrameIds[2]])
    expect(useWorkspace.getState().sessions[0].selectedAnimationFrameIds).toEqual([])
    useWorkspace.getState().undo()
    expect(timeline.frames.map((frame) => frame.id)).toEqual(originalFrameIds)
    useWorkspace.getState().redo()
    expect(timeline.frames.map((frame) => frame.id)).toEqual([originalFrameIds[2]])
  })

  it('links non-empty cels from a selected frame while leaving empty cels blank through undo and redo', () => {
    const document = createDocument('linked selected frame', 1, 1, 'rgba')
    const firstLayer = getActiveLayer(document)
    writeLayerColor(document, firstLayer, 0, red)
    const secondLayer = createLayer('Second', 1, 1, 'rgba')
    document.layers.push(secondLayer)
    const sourceFrameId = ensureAnimationDocument(document).activeFrameId
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().selectAnimationFrame(sourceFrameId)

    useWorkspace.getState().addLinkedAnimationFrame()

    let timeline = ensureAnimationDocument(document)
    const targetFrameId = timeline.activeFrameId
    expect(animationCelAt(timeline, firstLayer.id, targetFrameId)?.linkedCelId).toBe(animationCelAt(timeline, firstLayer.id, sourceFrameId)?.id)
    expect(animationCelAt(timeline, secondLayer.id, targetFrameId)?.linkedCelId).toBeUndefined()
    expect(animationCelHasContent(animationCelAt(timeline, secondLayer.id, targetFrameId) ?? null, document.palette)).toBe(false)

    useWorkspace.getState().undo()
    expect(ensureAnimationDocument(document).frames).toHaveLength(1)
    useWorkspace.getState().redo()
    timeline = ensureAnimationDocument(document)
    expect(timeline.activeFrameId).toBe(targetFrameId)
    expect(animationCelAt(timeline, firstLayer.id, targetFrameId)?.linkedCelId).toBe(animationCelAt(timeline, firstLayer.id, sourceFrameId)?.id)
    expect(animationCelAt(timeline, secondLayer.id, targetFrameId)?.linkedCelId).toBeUndefined()
    expect(animationCelHasContent(animationCelAt(timeline, secondLayer.id, targetFrameId) ?? null, document.palette)).toBe(false)
  })


})

describe('selection clipboard', () => {
  it('prefers a newer external image after an internal layer copy', async () => {
    const document = createDocument('layer then external clipboard', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    const api = window.moonSprite as any
    api.readClipboardImage = vi.fn(async () => null)
    useWorkspace.getState().copySelectedLayersToClipboard()
    api.readClipboardImage = vi.fn(async () => ({ width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) }))

    await useWorkspace.getState().pasteClipboard()
    const pending = useWorkspace.getState().sessions[0].pendingPaste
    expect(pending?.source.values[0]).toBe(packColor({ r: 0, g: 255, b: 0, a: 255 }))
  })

  it('prefers the internal layer copied after an external image', async () => {
    const document = createDocument('external then layer clipboard', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    const api = window.moonSprite as any
    api.readClipboardImage = vi.fn(async () => ({ width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) }))
    useWorkspace.getState().copySelectedLayersToClipboard()

    await useWorkspace.getState().pasteClipboard()
    expect(document.layers).toHaveLength(2)
    expect(useWorkspace.getState().sessions[0].pendingPaste).toBeNull()
  })

  it('switches paste source when the system image changes between layer copies', async () => {
    const document = createDocument('clipboard source switching', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    const api = window.moonSprite as any
    api.readClipboardImage = vi.fn(async () => ({ width: 1, height: 1, data: new Uint8Array([0, 255, 0, 255]) }))
    useWorkspace.getState().copySelectedLayersToClipboard()
    api.readClipboardImage = vi.fn(async () => ({ width: 1, height: 1, data: new Uint8Array([0, 0, 255, 255]) }))

    await useWorkspace.getState().pasteClipboard()
    expect(useWorkspace.getState().sessions[0].pendingPaste?.source.values[0]).toBe(packColor({ r: 0, g: 0, b: 255, a: 255 }))
    useWorkspace.getState().cancelFloatingPaste()
    useWorkspace.getState().copySelectedLayersToClipboard()
    await useWorkspace.getState().pasteClipboard()
    expect(document.layers).toHaveLength(2)
  })

  it('keeps a copied selection when a stale timeline cel clipboard exists across frames', async () => {
    const document = createDocument('cross-frame selection clipboard', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    const green = { r: 24, g: 190, b: 72, a: 255 }
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 1, green)
    useWorkspace.getState().addSession(document)
    const firstFrameId = ensureAnimationDocument(document).activeFrameId

    useWorkspace.getState().addAnimationFrame()
    const secondFrameId = ensureAnimationDocument(document).activeFrameId
    ensureLayerCoversCanvas(document, layer)
    writeLayerColor(document, layer, 0, blue)
    writeLayerColor(document, layer, 1, blue)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, firstFrameId))
    useWorkspace.getState().copySelectedAnimationCels()
    expect(useWorkspace.getState().sessions[0].animationCellClipboard).toHaveLength(1)

    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().copySelection()
    expect(useWorkspace.getState().sessions[0].animationCellClipboard).toHaveLength(0)

    useWorkspace.getState().selectAnimationCell(animationCelKey(layer.id, secondFrameId))
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
    await useWorkspace.getState().pasteSelection()
    useWorkspace.getState().commitFloatingPaste()

    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blue)
  })



  it('moves selection content across selected layers and animation frames as one undoable action', () => {
    const document = createDocument('multi-layer multi-frame selection move', 4, 1, 'rgba')
    const bottom = getActiveLayer(document)
    const top = createLayer('Top', 4, 1, 'rgba')
    const green = { r: 0, g: 200, b: 80, a: 255 }
    const yellow = { r: 240, g: 190, b: 0, a: 255 }
    document.layers.push(top)
    writeLayerColor(document, bottom, 0, red)
    writeLayerColor(document, top, 0, blue)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().duplicateAnimationFrame()
    writeLayerColor(document, bottom, 0, green)
    writeLayerColor(document, top, 0, yellow)
    const timeline = ensureAnimationDocument(document)
    const [first, second] = timeline.frames
    useWorkspace.getState().selectLayerRows([bottom.id, top.id], [])
    useWorkspace.getState().selectAnimationFrame(first.id)
    useWorkspace.getState().selectAnimationFrame(second.id, 'range')
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1 })
    const expectedActiveLayerId = document.activeLayerId
    const expectedActiveFrameId = timeline.activeFrameId

    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(1, 0)

    let session = useWorkspace.getState().sessions[0]
    expect(session.pendingPaste?.layers?.map(({ layerId, frameId }) => `${layerId}:${frameId}`)).toEqual([
      `${top.id}:${second.id}`,
      `${bottom.id}:${second.id}`,
      `${top.id}:${first.id}`,
      `${bottom.id}:${first.id}`
    ])
    expect(readLayerColorAt(document, animationLayerAtFrame(document, bottom.id, first.id)!, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, top.id, first.id)!, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, bottom.id, second.id)!, 1, 0)).toEqual(green)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, top.id, second.id)!, 1, 0)).toEqual(yellow)
    useWorkspace.getState().commitFloatingPaste()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedLayerIds).toEqual([bottom.id, top.id])
    expect(session.selectedAnimationFrameIds).toEqual([first.id, second.id])
    expect(session.document.activeLayerId).toBe(expectedActiveLayerId)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(expectedActiveFrameId)

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedLayerIds).toEqual([bottom.id, top.id])
    expect(session.selectedAnimationFrameIds).toEqual([first.id, second.id])
    expect(session.document.activeLayerId).toBe(expectedActiveLayerId)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(expectedActiveFrameId)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, bottom.id, first.id)!, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, top.id, first.id)!, 0, 0)).toEqual(blue)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, bottom.id, second.id)!, 0, 0)).toEqual(green)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, top.id, second.id)!, 0, 0)).toEqual(yellow)

    useWorkspace.getState().redo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selectedLayerIds).toEqual([bottom.id, top.id])
    expect(session.selectedAnimationFrameIds).toEqual([first.id, second.id])
    expect(session.document.activeLayerId).toBe(expectedActiveLayerId)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(expectedActiveFrameId)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, bottom.id, first.id)!, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, top.id, first.id)!, 1, 0)).toEqual(blue)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, bottom.id, second.id)!, 1, 0)).toEqual(green)
    expect(readLayerColorAt(document, animationLayerAtFrame(document, top.id, second.id)!, 1, 0)).toEqual(yellow)
  })



  it('wraps a deferred tiled selection move on commit and preserves it through undo and redo', () => {
    const document = createDocument('tiled selection commit', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 3, blue)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setTileRepeatMode('x')
    const selection = { x: 3, y: 0, width: 1, height: 1 }
    const target = { ...selection, x: 4 }
    const source = captureSelectionTransform(document, selection, layer, { cacheOpaqueOffsets: false })!

    useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, target, false, 'repeat move', null, target, 0, undefined, true)
    useWorkspace.getState().commitFloatingPaste()

    const session = useWorkspace.getState().sessions[0]
    expect(session.selection).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, layer, 3, 0).a).toBe(0)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(blue)
    useWorkspace.getState().undo()
    expect(session.selection).toEqual(selection)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
    useWorkspace.getState().redo()
    expect(session.selection).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(blue)
  })













  it('keeps a pasted selection box movable without losing the floating clipboard copy', async () => {
    const document = createDocument('floating paste undo move', 6, 1, 'rgba')
    const layer = getActiveLayer(document)
    const darkBlue = { r: 12, g: 38, b: 86, a: 255 }
    const green = { r: 18, g: 96, b: 52, a: 255 }
    const amber = { r: 164, g: 92, b: 24, a: 255 }
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 1, transparent)
    writeLayerColor(document, layer, 2, darkBlue)
    writeLayerColor(document, layer, 3, green)
    writeLayerColor(document, layer, 4, blue)
    writeLayerColor(document, layer, 5, amber)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 2, height: 1 })
    useWorkspace.getState().copySelection()
    await useWorkspace.getState().pasteSelection()

    let pending = useWorkspace.getState().sessions[0].pendingPaste
    if (!pending) throw new Error('missing floating paste')
    expect(pending.source.selection.mask).toEqual(Uint8Array.from([1, 0]))
    expect(pending.target).toEqual({ x: 0, y: 0, width: 2, height: 1 })
    expect(useWorkspace.getState().sessions[0].selection).toEqual(pending.target)

    useWorkspace.getState().commitFloatingSelectionBoxMove(
      pending.target,
      { ...pending.target, x: 2 },
      null,
      null
    )

    pending = useWorkspace.getState().sessions[0].pendingPaste
    expect(pending?.target).toEqual({ x: 0, y: 0, width: 2, height: 1 })
    expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 2, y: 0, width: 2, height: 1 })
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(darkBlue)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(green)

    useWorkspace.getState().undo()

    pending = useWorkspace.getState().sessions[0].pendingPaste
    expect(pending?.target).toEqual({ x: 0, y: 0, width: 2, height: 1 })
    expect(pending?.source.origin).toBe('clipboard')
    expect(pending?.source.selection.mask).toEqual(Uint8Array.from([1, 0]))
    expect(pending?.copy).toBe(true)
    expect(useWorkspace.getState().sessions[0].selection).toEqual(pending?.target)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(darkBlue)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(green)

    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 2, y: 0, width: 2, height: 1 })
    expect(useWorkspace.getState().sessions[0].pendingPaste).not.toBeNull()
    useWorkspace.getState().undo()

    if (!pending) throw new Error('floating paste was cancelled by undo')
    useWorkspace.getState().moveActiveSelectionWithSelectionHistory(4, 0)

    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(darkBlue)
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 5, 0)).toEqual(amber)
    expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 4, y: 0, width: 2, height: 1 })
    useWorkspace.getState().cancelFloatingPaste()
    expect(readLayerColorAt(document, layer, 4, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 5, 0)).toEqual(amber)
  })

  it('clears free-transform mode when a floating transform is deselected', () => {
    const document = createDocument('free transform deselect', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)

    const selection = { x: 0, y: 0, width: 1, height: 1 }
    useWorkspace.getState().setSelection(selection)
    useWorkspace.getState().beginFreeTransform()
    const source = captureSelectionTransform(document, selection, layer, { cacheOpaqueOffsets: false })
    if (!source) throw new Error('missing free-transform source')
    const target = { ...selection, x: 1 }
    useWorkspace.getState().beginFloatingSelectionTransform(source, null, selection, target, false, 'free transform', null, target, 0)

    expect(useWorkspace.getState().sessions[0].freeTransformActive).toBe(true)
    expect(useWorkspace.getState().sessions[0].pendingPaste).not.toBeNull()

    useWorkspace.getState().commitFloatingPaste('deselect')
    let session = useWorkspace.getState().sessions[0]
    expect(session.selection).toBeNull()
    expect(session.pendingPaste).toBeNull()
    expect(session.freeTransformActive).toBe(false)
    expect(session.freeTransformQuad).toBeNull()

    useWorkspace.getState().undo()
    session = useWorkspace.getState().sessions[0]
    expect(session.selection).toEqual(target)
    expect(session.freeTransformActive).toBe(false)
    useWorkspace.getState().redo()
    expect(useWorkspace.getState().sessions[0].selection).toBeNull()
    expect(useWorkspace.getState().sessions[0].freeTransformActive).toBe(false)
  })


})

describe('selection properties', () => {
  it('updates selection geometry, keeps the mask, shrinks to content, and supports undo', () => {
    const document = createDocument('selection properties', 8, 6, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 2 * document.width + 3, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 1, y: 1, width: 5, height: 4, mask: new Uint8Array([
      0, 0, 0, 0, 0,
      0, 1, 1, 1, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0
    ]) })
    useWorkspace.getState().setSelectionPropertiesActive(true)
    useWorkspace.getState().updateSelectionProperties({ x: 2, y: 1, width: 4, height: 4 })

    // Content added elsewhere on the same layer must not affect shrinking the
    // active selection.
    writeLayerColor(document, layer, 0, blue)

    expect(useWorkspace.getState().sessions[0].selectionPropertiesActive).toBe(true)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 3, y: 2, width: 2, height: 2 })
    expect(useWorkspace.getState().sessions[0].selection?.mask).toBeInstanceOf(Uint8Array)
    expect(readLayerColorAt(document, layer, 4, 2)).toEqual(red)

    useWorkspace.getState().shrinkSelectionToContent()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 4, y: 2, width: 1, height: 1 })
    useWorkspace.getState().undo()
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 3, y: 2, width: 2, height: 2 })
  })

  it('keeps an irregular selection mask when shrinking to content', () => {
    const document = createDocument('irregular selection shrink', 8, 8, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 2 * document.width + 2, red)
    writeLayerColor(document, layer, 4 * document.width + 4, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 1, y: 1, width: 5, height: 5, mask: new Uint8Array([
      0, 0, 0, 0, 0,
      0, 1, 1, 0, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 1, 0,
      0, 0, 0, 0, 0
    ]) })

    useWorkspace.getState().shrinkSelectionToContent()

    const selection = useWorkspace.getState().sessions[0].selection
    expect(selection).toMatchObject({ x: 2, y: 2, width: 3, height: 3 })
    expect(Array.from(selection?.mask ?? [])).toEqual([
      1, 1, 0,
      1, 1, 1,
      0, 0, 1
    ])
  })

  it('keeps the custom pivot fixed for property rotation and shear', () => {
    const document = createDocument('selection properties pivot', 12, 12, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 5 * document.width + 5, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 4, y: 4, width: 3, height: 3 })
    useWorkspace.getState().setSelectionPivot({ x: 4.5, y: 4.5 })
    useWorkspace.getState().setSelectionPropertiesActive(true)

    useWorkspace.getState().updateSelectionProperties({ angle: 90 })
    let session = useWorkspace.getState().sessions[0]
    const rotatedTarget = session.pendingPaste?.transformTarget
    expect(rotatedTarget).toBeDefined()
    expect(transformedSelectionPivotPreset(rotatedTarget!, 'nw', 90)).toEqual({ x: 4.5, y: 4.5 })

    useWorkspace.getState().updateSelectionProperties({ shearAngle: 20 })
    session = useWorkspace.getState().sessions[0]
    const shearedTarget = session.pendingPaste?.transformTarget
    const sheared = session.pendingPaste?.transformShear
    expect(shearedTarget).toBeDefined()
    expect(transformedSelectionPivotPreset(shearedTarget!, 'nw', session.pendingPaste?.transformAngle ?? 0, sheared)).toEqual({ x: 4.5, y: 4.5 })
  })
})

describe('resize history', () => {
  it('undoes and redoes canvas and image size adjustments with their selection', async () => {
    const document = createDocument('resize history', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 0, y: 0, width: 1, height: 1, mask: new Uint8Array([1]) })

    await useWorkspace.getState().resizeActiveCanvas(3, 3, 'center')
    expect(document.width).toBe(3)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().undo()
    expect(document.width).toBe(2)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
    useWorkspace.getState().redo()
    expect(document.width).toBe(3)

    await useWorkspace.getState().resizeActiveImage(4, 4, 'nearest')
    expect(document.width).toBe(4)
    useWorkspace.getState().undo()
    expect(document.width).toBe(3)
    useWorkspace.getState().redo()
    expect(document.width).toBe(4)
  })

  it('crops the canvas to the selection and restores the prior selection through undo and redo', async () => {
    const document = createDocument('crop selection', 4, 3, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1 * document.width + 2, red)
    writeLayerColor(document, layer, 2 * document.width + 1, blue)
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setSelection({ x: 1, y: 1, width: 2, height: 2 })

    await useWorkspace.getState().cropActiveCanvas()

    expect(document).toMatchObject({ width: 2, height: 2 })
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 0, 1)).toEqual(blue)
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 2, height: 2 })

    useWorkspace.getState().undo()
    expect(document).toMatchObject({ width: 4, height: 3 })
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 1, y: 1, width: 2, height: 2 })

    useWorkspace.getState().redo()
    expect(document).toMatchObject({ width: 2, height: 2 })
    expect(useWorkspace.getState().sessions[0].selection).toMatchObject({ x: 0, y: 0, width: 2, height: 2 })
  })

  it('trims to the final visible composite and ignores hidden layer content', async () => {
    const document = createDocument('trim visible', 4, 3, 'rgba')
    const visible = getActiveLayer(document)
    writeLayerColor(document, visible, 1 * document.width + 2, red)
    const hidden = createLayer('Hidden', 4, 3, 'rgba')
    hidden.visible = false
    writeLayerColor(document, hidden, 0, blue)
    document.layers.push(hidden)
    useWorkspace.getState().addSession(document)

    await useWorkspace.getState().trimActiveCanvas()

    expect(document).toMatchObject({ width: 1, height: 1 })
    expect(readLayerColorAt(document, visible, 0, 0)).toEqual(red)
    useWorkspace.getState().undo()
    expect(document).toMatchObject({ width: 4, height: 3 })
  })

})

describe('color mode history', () => {
  it('restores RGBA surfaces and generated indexed colors together', async () => {
    const document = createDocument('color mode undo', 2, 1, 'rgba')
    const layer = getActiveLayer(document)
    const custom = { r: 17, g: 93, b: 201, a: 173 }
    writeLayerColor(document, layer, 0, custom)
    writeLayerColor(document, layer, 1, red)
    useWorkspace.getState().addSession(document)
    const cel = ensureAnimationDocument(document).cels[0]
    const beforePalette = document.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
    const beforePaletteOrder = [...document.paletteOrder]
    const beforeNextColorId = document.nextColorId

    await useWorkspace.getState().convertColorMode('indexed')

    const indexedPalette = document.palette.map((entry) => ({ ...entry, color: { ...entry.color } }))
    const indexedPaletteOrder = [...document.paletteOrder]
    const indexedNextColorId = document.nextColorId
    const indexedColor = readLayerColor(document, layer, 0)
    expect(document.colorMode).toBe('indexed')
    expect(layer.format).toBe('indexed')
    expect(cel.surface?.format).toBe('indexed')
    expect(document.palette.length).toBeGreaterThan(beforePalette.length)
    expect(indexedColor).not.toEqual(custom)

    useWorkspace.getState().undo()

    expect(document.colorMode).toBe('rgba')
    expect(layer.format).toBe('rgba')
    expect(cel.surface?.format).toBe('rgba')
    expect(layer.pixels).toBeInstanceOf(Uint8ClampedArray)
    expect(readLayerColor(document, layer, 0)).toEqual(custom)
    expect(readLayerColor(document, layer, 1)).toEqual(red)
    expect(document.palette).toEqual(beforePalette)
    expect(document.paletteOrder).toEqual(beforePaletteOrder)
    expect(document.nextColorId).toBe(beforeNextColorId)

    useWorkspace.getState().redo()

    expect(document.colorMode).toBe('indexed')
    expect(layer.format).toBe('indexed')
    expect(cel.surface?.format).toBe('indexed')
    expect(document.palette).toEqual(indexedPalette)
    expect(document.paletteOrder).toEqual(indexedPaletteOrder)
    expect(document.nextColorId).toBe(indexedNextColorId)
    expect(readLayerColor(document, layer, 0)).toEqual(indexedColor)
  })
})

describe('save concurrency', () => {




  it('keeps newer edits dirty and preserves recovery data when an older save finishes', async () => {
    const deferred: { resolve?: () => void } = {}
    const writeBinaryAtomic = vi.fn(() => new Promise<void>((resolve) => { deferred.resolve = resolve }))
    const writeRecovery = vi.fn(async () => {})
    const deleteRecovery = vi.fn(async () => {})
    installApi({ writeBinaryAtomic, writeRecovery, deleteRecovery })

    const document = createDocument('save revision', 2, 2, 'rgba')
    document.filePath = 'D:/gallery/save-revision.moonsprite'
    document.dirty = true
    useWorkspace.getState().addSession(document)

    const saving = useWorkspace.getState().saveActive()
    await vi.waitFor(() => expect(writeBinaryAtomic).toHaveBeenCalledTimes(1))
    useWorkspace.getState().mutateActive((session) => {
      writeLayerColor(session.document, getActiveLayer(session.document), 0, blue)
    })
    deferred.resolve?.()

    await expect(saving).resolves.toBe(true)
    expect(document.dirty).toBe(true)
    await vi.waitFor(() => expect(writeRecovery).toHaveBeenCalledTimes(1))
    expect(deleteRecovery).not.toHaveBeenCalled()
    expect(useWorkspace.getState().message).toBe('工程已写入磁盘，但保存期间产生的新修改仍未保存。')
  })
})

describe('file open concurrency', () => {
  it('opens a multi-file selection sequentially', async () => {
    let releaseFirst!: () => void
    const reads: string[] = []
    const archives = new Map([
      ['first.moonsprite', encodeProject(createDocument('first', 8, 8, 'rgba'))],
      ['second.moonsprite', encodeProject(createDocument('second', 8, 8, 'rgba'))]
    ])
    const readBinary = vi.fn(async (filePath: string) => {
      reads.push(`${filePath}:start`)
      if (filePath === 'first.moonsprite') await new Promise<void>((resolve) => { releaseFirst = resolve })
      reads.push(`${filePath}:end`)
      return archives.get(filePath)!
    })
    installApi({
      openFiles: vi.fn(async () => ({ canceled: false, filePaths: [...archives.keys()] })),
      readBinary
    })

    const opening = useWorkspace.getState().openFiles()
    await vi.waitFor(() => expect(reads).toEqual(['first.moonsprite:start']))
    expect(readBinary).toHaveBeenCalledTimes(1)
    releaseFirst()
    await opening

    expect(reads).toEqual([
      'first.moonsprite:start',
      'first.moonsprite:end',
      'second.moonsprite:start',
      'second.moonsprite:end'
    ])
    expect(useWorkspace.getState().sessions).toHaveLength(2)
  })
})

describe('cross-document animation clipboard', () => {
  it('pastes a cel into a different document without explicit target selection', async () => {
    const source = createDocument('source cel', 1, 1, 'rgba')
    const sourceLayer = getActiveLayer(source)
    useWorkspace.getState().addSession(source)
    const sourceTimeline = ensureAnimationDocument(source)
    const sourceCel = animationCelAt(sourceTimeline, sourceLayer.id, sourceTimeline.activeFrameId)!
    sourceCel.surface!.pixels.set([255, 32, 64, 255])
    useWorkspace.getState().selectAnimationCell(animationCelKey(sourceLayer.id, sourceTimeline.activeFrameId))
    useWorkspace.getState().copySelectedAnimationCels()

    const target = createDocument('target cel', 1, 1, 'rgba')
    const targetLayer = getActiveLayer(target)
    useWorkspace.getState().addSession(target)
    const targetTimeline = ensureAnimationDocument(target)
    await useWorkspace.getState().pasteClipboard()

    const targetCel = animationCelAt(targetTimeline, targetLayer.id, targetTimeline.activeFrameId)!
    expect(targetCel.id).not.toBe(sourceCel.id)
    expect(targetCel.surface?.pixels).toEqual(sourceCel.surface?.pixels)
    expect(targetCel.surface).not.toBe(sourceCel.surface)
    expect(targetCel.linkedCelId).toBeNull()
    useWorkspace.getState().undo()
    expect(animationCelAt(targetTimeline, targetLayer.id, targetTimeline.activeFrameId)?.surface?.pixels).not.toEqual(sourceCel.surface?.pixels)
    useWorkspace.getState().redo()
    expect(animationCelAt(targetTimeline, targetLayer.id, targetTimeline.activeFrameId)?.surface?.pixels).toEqual(sourceCel.surface?.pixels)
  })

  it('pastes copied frames across documents with duration and pixel content', async () => {
    const source = createDocument('source frames', 1, 1, 'rgba')
    const sourceLayer = getActiveLayer(source)
    useWorkspace.getState().addSession(source)
    const sourceTimeline = ensureAnimationDocument(source)
    const firstFrameId = sourceTimeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(source)
    sourceTimeline.frames.find((frame) => frame.id === secondFrameId)!.duration = 240
    const sourceCel = animationCelAt(sourceTimeline, sourceLayer.id, secondFrameId)!
    sourceCel.surface!.pixels.set([32, 128, 255, 255])
    useWorkspace.getState().selectAnimationFrame(secondFrameId)
    useWorkspace.getState().copySelectedAnimationFrames()

    const target = createDocument('target frames', 1, 1, 'rgba')
    const targetLayer = getActiveLayer(target)
    useWorkspace.getState().addSession(target)
    const targetTimeline = ensureAnimationDocument(target)
    await useWorkspace.getState().pasteClipboard()

    expect(targetTimeline.frames).toHaveLength(2)
    const insertedFrame = targetTimeline.frames.at(-1)!
    expect(insertedFrame.duration).toBe(240)
    const targetCel = animationCelAt(targetTimeline, targetLayer.id, insertedFrame.id)!
    expect(targetCel.surface?.pixels).toEqual(sourceCel.surface?.pixels)
    expect(targetCel.id).not.toBe(sourceCel.id)
    expect(firstFrameId).not.toBe(secondFrameId)
    useWorkspace.getState().undo()
    expect(targetTimeline.frames).toHaveLength(1)
    useWorkspace.getState().redo()
    expect(targetTimeline.frames).toHaveLength(2)
  })

  it('copies every layer when a frame is copied across documents', async () => {
    const source = createDocument('source all layers', 1, 1, 'rgba')
    const sourceBottom = getActiveLayer(source)
    const sourceTop = createLayer('Top', 1, 1, 'rgba')
    source.layers.push(sourceTop)
    useWorkspace.getState().addSession(source)
    const sourceTimeline = ensureAnimationDocument(source)
    const frameId = sourceTimeline.activeFrameId
    animationCelAt(sourceTimeline, sourceBottom.id, frameId)!.surface!.pixels.set([255, 0, 0, 255])
    animationCelAt(sourceTimeline, sourceTop.id, frameId)!.surface!.pixels.set([0, 255, 0, 255])
    useWorkspace.getState().selectAnimationFrame(frameId)
    useWorkspace.getState().copySelectedAnimationFrames()

    const target = createDocument('target all layers', 1, 1, 'rgba')
    const targetBottom = getActiveLayer(target)
    useWorkspace.getState().addSession(target)
    const targetTimeline = ensureAnimationDocument(target)
    await useWorkspace.getState().pasteClipboard()

    const insertedFrame = targetTimeline.frames.at(-1)!
    const targetTop = target.layers[1]
    expect(targetTop).toBeDefined()
    expect(animationCelAt(targetTimeline, targetBottom.id, insertedFrame.id)?.surface?.pixels).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    expect(animationCelAt(targetTimeline, targetTop.id, insertedFrame.id)?.surface?.pixels).toEqual(new Uint8ClampedArray([0, 255, 0, 255]))
  })

  it('pastes a special text cel as rendered content into a raster target', async () => {
    const source = createDocument('source text cel', 16, 8, 'rgba')
    useWorkspace.getState().addSession(source)
    useWorkspace.getState().createTextLayer(textData('跨文件'), 0, 0)
    const sourceSession = useWorkspace.getState().sessions.find((session) => session.document.id === source.id)!
    const sourceLayer = source.layers.find((layer) => layer.kind === 'text')!
    const sourceTimeline = ensureAnimationDocument(source)
    const sourceCel = animationCelAt(sourceTimeline, sourceLayer.id, sourceTimeline.activeFrameId)!
    expect(sourceCel.text).toBeDefined()
    useWorkspace.getState().selectAnimationCell(animationCelKey(sourceLayer.id, sourceTimeline.activeFrameId))
    useWorkspace.getState().copySelectedAnimationCels()

    const target = createDocument('target raster cel', 16, 8, 'rgba')
    const targetLayer = getActiveLayer(target)
    useWorkspace.getState().addSession(target)
    const targetTimeline = ensureAnimationDocument(target)
    await useWorkspace.getState().pasteClipboard()

    const targetCel = animationCelAt(targetTimeline, targetLayer.id, targetTimeline.activeFrameId)!
    expect(targetCel.surface?.pixels).toEqual(sourceCel.surface?.pixels)
    expect(targetCel.text).toBeUndefined()
    expect(sourceSession.document.id).not.toBe(target.id)
  })

  it('preserves linked cels and layer masks when copying selected cells across documents', async () => {
    const source = createDocument('source linked cel mask', 1, 1, 'rgba')
    const sourceLayer = getActiveLayer(source)
    useWorkspace.getState().addSession(source)
    const sourceTimeline = ensureAnimationDocument(source)
    const firstFrameId = sourceTimeline.activeFrameId
    const secondFrameId = addBlankAnimationFrame(source)
    const firstCel = animationCelAt(sourceTimeline, sourceLayer.id, firstFrameId)!
    const secondCel = animationCelAt(sourceTimeline, sourceLayer.id, secondFrameId)!
    firstCel.surface!.pixels.set([240, 80, 40, 255])
    secondCel.surface = firstCel.surface
    secondCel.linkedCelId = firstCel.id
    useWorkspace.getState().createLayerMask(firstCel.id)
    const sourceMask = animationMaskAt(sourceTimeline, sourceLayer.id, firstFrameId)!
    sourceMask.pixels.fill(255)
    useWorkspace.getState().selectAnimationCell(animationCelKey(sourceLayer.id, firstFrameId))
    useWorkspace.getState().selectAnimationCell(animationCelKey(sourceLayer.id, secondFrameId), 'toggle')
    useWorkspace.getState().copySelectedAnimationCels()

    const target = createDocument('target linked cel mask', 1, 1, 'rgba')
    const targetLayer = getActiveLayer(target)
    useWorkspace.getState().addSession(target)
    const targetTimeline = ensureAnimationDocument(target)
    await useWorkspace.getState().pasteClipboard()

    const pastedFirst = animationCelAt(targetTimeline, targetLayer.id, targetTimeline.frames[0].id)!
    const pastedSecond = animationCelAt(targetTimeline, targetLayer.id, targetTimeline.frames[1].id)!
    expect(pastedSecond.linkedCelId).toBe(pastedFirst.id)
    expect(animationMaskAt(targetTimeline, targetLayer.id, targetTimeline.frames[0].id)?.pixels).toEqual(sourceMask.pixels)
  })
})


describe('history commands during a pixel gesture', () => {
  it('serializes repeated undo after commit and restores redo without resurrecting pixels', async () => {
    const document = createDocument('undo held during stroke', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    const first = beginPixelEdit(layer.id)
    recordPixel(document, layer, first, 5, packColor(red))
    useWorkspace.getState().commitPixelEdit(first, 'first')
    const pending = beginPixelEdit(layer.id)
    recordPixel(document, layer, pending, 5, packColor(blue))
    const history = useWorkspace.getState().sessions[0].history
    beginCanvasToolGesture(9001)
    try {
      useWorkspace.getState().undo()
      useWorkspace.getState().undo()
      expect(history.position).toBe(1)
      expect(readLayerColor(document, layer, 5)).toEqual(blue)
      useWorkspace.getState().commitPixelEdit(pending, 'second')
      endCanvasToolGesture(9001)
      await Promise.resolve()
      expect(history.canUndo).toBe(false)
      expect(readLayerColor(document, layer, 5).a).toBe(0)
      useWorkspace.getState().redo()
      expect(readLayerColor(document, layer, 5)).toEqual(red)
      useWorkspace.getState().redo()
      expect(readLayerColor(document, layer, 5)).toEqual(blue)
    } finally { clearCanvasToolGestures() }
  })

  it('defers history-panel jumps until the new stroke is committed', async () => {
    const document = createDocument('history jump during stroke', 4, 4, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = document.layers[0]
    const first = beginPixelEdit(layer.id)
    recordPixel(document, layer, first, 5, packColor(red))
    useWorkspace.getState().commitPixelEdit(first, 'first')
    beginCanvasToolGesture(9002)
    try {
      const pending = beginPixelEdit(layer.id)
      recordPixel(document, layer, pending, 5, packColor(blue))
      useWorkspace.getState().setHistoryPosition(0)
      expect(readLayerColor(document, layer, 5)).toEqual(blue)
      useWorkspace.getState().commitPixelEdit(pending, 'second')
      endCanvasToolGesture(9002)
      await Promise.resolve()
      expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
      expect(readLayerColor(document, layer, 5).a).toBe(0)
    } finally { clearCanvasToolGestures() }
  })

  it('does not execute a deferred command on a different document', async () => {
    const first = createDocument('first document', 4, 4, 'rgba')
    useWorkspace.getState().addSession(first)
    beginCanvasToolGesture(9003)
    try {
      useWorkspace.getState().undo()
      const second = createDocument('second document', 4, 4, 'rgba')
      useWorkspace.getState().addSession(second)
      const edit = beginPixelEdit(second.layers[0].id)
      recordPixel(second, second.layers[0], edit, 5, packColor(red))
      useWorkspace.getState().commitPixelEdit(edit, 'second document edit')
      endCanvasToolGesture(9003)
      await Promise.resolve()
      expect(readLayerColor(second, second.layers[0], 5)).toEqual(red)
    } finally { clearCanvasToolGestures() }
  })
})
