import { describe, expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, createSparseLayer, DocumentCompositeCache, findOrAddPaletteColor, getActiveLayer, readLayerColor, readLayerColorAt, resizeDocumentAt, writeLayerColor } from './document'
import { beginPixelEdit, commitPixelEdit, HistoryStack } from './history'
import { antiAliasSelection, appendPerfectPixelSegment, applySelectionTransform, applySelectionTranslationCommit, applySelectionTranslationPreview, bezierCurvePixelPoints, brushMaskOffsets, brushPathStampPoints, brushStampAnchor, brushStampDimensions, brushStrokeInvalidationRects, captureSelectionTransform, clearSelection, filledShapePathPixelPoints, fillSelectionOrCanvas, flipLayer, flipSelection, floodFill, floodFillSymmetric, inheritBrushPaintBaseline, lineShapePixelPoints, moveSelection, outlinePixelIndices, outlineSelection, outlineSelectionBoundary, paintBrush, paintBrushPath, paintLine, paintShape, paintShapePixelPoints, perfectPixelPathPoints, replaceLayerColor, rotatedShapePixelPoints, sampleCompositeColor, selectionTransformPreviewPacked, selectionTranslationPreviewEdit, shapeBoundaryPixelPoints, shapeContainsPixel, shapePixelPoints, solidBrushPreviewRowSpans, solidBrushStampDifferenceRects } from './tools'
import { combineSelection, ellipseSelection, lassoSelection, magicWandSelection, rasterLinePoints, rotatedSelectionBounds, selectionBoundarySegments, selectionContains, selectionQuadBounds, transformedSelectionBounds, transformedSelectionSourcePoint, transformSelectionMask } from './selection'
import { resizeDocument } from './document'
import { createProceduralBrush, createProceduralBrushes, createSelectionBrush, proceduralBrushCoverageAt } from './brushes'
import { blendOver, packColor, unpackColor } from './raster'
import { installRuntimeRaster, runtimeRasterForSurface } from './runtime-raster'
import type { RuntimeRasterTiles } from '@shared/types'
import { balancedStairLinePoints } from './pixel-line'
import { symmetrySelection, type SymmetryAxes } from './symmetry'

const blue = { r: 41, g: 121, b: 255, a: 255 }
const red = { r: 255, g: 48, b: 48, a: 255 }
const black = { r: 0, g: 0, b: 0, a: 255 }

describe('pixel tools', () => {
  it('composites translucent selection pixels over an existing destination when moved or copied', () => {
    const document = createDocument('translucent selection source-over', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    const base = { r: 30, g: 90, b: 210, a: 255 }
    const sourceColor = { r: 240, g: 40, b: 20, a: 128 }
    writeLayerColor(document, layer, 2, base)
    writeLayerColor(document, layer, 0, sourceColor)
    const selection = { x: 0, y: 0, width: 1, height: 1 }
    const source = captureSelectionTransform(document, selection, layer)!
    const expected = blendOver(base, sourceColor)

    applySelectionTransform(document, source, { ...selection, x: 2 }, 0, false, undefined, undefined, undefined, layer)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(expected)
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)

    writeLayerColor(document, layer, 0, sourceColor)
    const copySource = captureSelectionTransform(document, selection, layer)!
    applySelectionTransform(document, copySource, { ...selection, x: 2 }, 0, true, undefined, undefined, undefined, layer)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(blendOver(expected, sourceColor))

    const previewDocument = createDocument('translucent selection preview source-over', 4, 1, 'rgba')
    const previewLayer = getActiveLayer(previewDocument)
    writeLayerColor(previewDocument, previewLayer, 2, base)
    writeLayerColor(previewDocument, previewLayer, 0, sourceColor)
    const previewSource = captureSelectionTransform(previewDocument, selection, previewLayer)!
    applySelectionTranslationPreview(previewDocument, previewSource, { ...selection, x: 2 }, true, null, previewLayer)
    expect(readLayerColorAt(previewDocument, previewLayer, 2, 0)).toEqual(expected)
  })

  it('composites translucent pixels in the committed translation path', () => {
    const document = createDocument('translucent committed translation', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    const base = { r: 30, g: 90, b: 210, a: 255 }
    const sourceColor = { r: 240, g: 40, b: 20, a: 128 }
    writeLayerColor(document, layer, 2, base)
    writeLayerColor(document, layer, 0, sourceColor)
    const selection = { x: 0, y: 0, width: 1, height: 1 }
    const source = captureSelectionTransform(document, selection, layer)!
    const expected = blendOver(base, sourceColor)

    const edit = applySelectionTranslationCommit(document, source, { ...selection, x: 2 }, false, layer)
    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(expected)
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
  })

  it('uses the pre-move backdrop for overlapping translucent selection transforms', () => {
    const document = createDocument('overlapping translucent selection transform', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    const base = { r: 30, g: 90, b: 210, a: 255 }
    const sourceColor = { r: 240, g: 40, b: 20, a: 128 }
    writeLayerColor(document, layer, 0, sourceColor)
    writeLayerColor(document, layer, 1, base)
    const selection = { x: 0, y: 0, width: 1, height: 1 }
    const source = captureSelectionTransform(document, selection, layer)!

    const edit = applySelectionTransform(document, source, { ...selection, x: 1 }, 0, false, undefined, undefined, undefined, layer)
    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(blendOver(base, sourceColor))
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
  })

  it('materializes sparse layer storage before the opaque pencil fast path writes', () => {
    const document = createDocument('lazy pencil stroke', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    const runtime: RuntimeRasterTiles = {
      kind: 'sparse-tiles-v1',
      format: 'rgba',
      width: 4,
      height: 4,
      tileSize: 4,
      data: new Uint8Array(4 * 4 * 4),
      tileOffsets: new Int32Array([1])
    }
    installRuntimeRaster(layer, runtime)
    const edit = beginPixelEdit(layer.id)

    paintBrush(document, layer, edit, 2, 2, 1, blue, 'square')

    expect(runtimeRasterForSurface(layer)).toBeNull()
    expect(readLayerColorAt(document, layer, 2, 2)).toEqual(blue)
    expect(Array.from(compositeRegion(document, 2, 2, 1, 1).slice(0, 4))).toEqual([blue.r, blue.g, blue.b, blue.a])
  })

  it('removes redundant perfect-pixel corners after fast pointer movement', () => {
    const path = [{ x: 2, y: 1 }]
    expect(appendPerfectPixelSegment(path, { x: 2, y: 6 })).toBe(false)
    expect(appendPerfectPixelSegment(path, { x: 8, y: 6 })).toBe(true)
    expect(path).toContainEqual({ x: 2, y: 5 })
    expect(path).not.toContainEqual({ x: 2, y: 6 })
    expect(path).toContainEqual({ x: 3, y: 6 })
  })

  it('paints and undoes overlapping large opaque stamps exactly once per pixel', () => {
    const document = createDocument('large overlapping brush', 80, 48, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)

    paintBrush(document, layer, edit, 24, 24, 32, blue, 'square')
    paintBrush(document, layer, edit, 28, 24, 32, blue, 'square')

    expect(edit.before.size).toBe(36 * 32)
    expect(readLayerColorAt(document, layer, 12, 8)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 43, 39)).toEqual(blue)
    const history = commitPixelEdit(document, edit, 'large brush')!
    history.undo()
    expect(readLayerColorAt(document, layer, 12, 8).a).toBe(0)
    expect(readLayerColorAt(document, layer, 43, 39).a).toBe(0)
  })

  it('records 128px solid strokes in typed point buffers and restores them exactly', () => {
    const document = createDocument('typed large brush history', 256, 256, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)

    paintBrush(document, layer, edit, 96, 128, 128, blue, 'square')
    paintBrush(document, layer, edit, 100, 128, 128, blue, 'square')

    expect(edit.before.size).toBe(0)
    expect(edit.points?.count).toBe(132 * 128)
    const history = commitPixelEdit(document, edit, '128px brush')!
    history.undo()
    expect(readLayerColorAt(document, layer, 40, 64).a).toBe(0)
    expect(readLayerColorAt(document, layer, 163, 191).a).toBe(0)
    history.redo()
    expect(readLayerColorAt(document, layer, 40, 64)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 163, 191)).toEqual(blue)
  })



  it('paints a selection brush with its captured source colors', () => {
    const document = createDocument('colored brush', 4, 2, 'rgba')
    const layer = getActiveLayer(document)
    const brush = {
      id: 'project-brush-test',
      name: 'Captured colors',
      width: 2,
      height: 1,
      coverage: new Uint8Array([255, 255]),
      colors: new Uint32Array([
        0xff0000ff,
        0xff00ff00
      ]),
      intrinsicSize: true,
      sourceX: 0,
      sourceY: 0
    }
    const edit = beginPixelEdit(layer.id)

    paintBrush(document, layer, edit, 1, 0, 1, { r: 255, g: 255, b: 255, a: 255 }, 'square', null, 'solid', 1, brush, undefined, 0, 'pattern-source')

    expect(readLayerColor(document, layer, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
    expect(readLayerColor(document, layer, 1)).toEqual({ r: 0, g: 255, b: 0, a: 255 })
  })



  it('paints a balanced Shift line from the same stair points used by its preview', () => {
    const document = createDocument('balanced line', 9, 3, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)

    paintLine(document, layer, edit, 0, 0, 8, 2, 1, blue, null, 'square', 'solid', 1, null, undefined, 0, 'paint', undefined, 'balanced')

    const rows = Array.from({ length: 3 }, (_, y) => Array.from({ length: 9 }, (_, x) => readLayerColorAt(document, layer, x, y).a > 0 ? 1 : 0))
    expect(rows).toEqual([
      [1, 1, 1, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 1, 1, 1]
    ])
  })

  it('replaces paint-mode image brush pixels in path order and skips transparent source pixels', () => {
    const document = createDocument('image brush overwrite', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    const base = { r: 40, g: 180, b: 80, a: 255 }
    const translucentRed = { r: 255, g: 0, b: 0, a: 128 }
    const translucentBlue = { r: 0, g: 0, b: 255, a: 128 }
    const transparent = { r: 0, g: 0, b: 0, a: 0 }
    for (let index = 0; index < 4; index += 1) writeLayerColor(document, layer, index, base)
    const brush = {
      id: 'overwrite.png',
      name: 'Overwrite',
      width: 3,
      height: 1,
      coverage: new Uint8Array([0, 128, 128]),
      colors: new Uint32Array([packColor(transparent), packColor(translucentRed), packColor(translucentBlue)]),
      intrinsicSize: true
    }

    paintLine(document, layer, beginPixelEdit(layer.id), 1, 0, 2, 0, 1, red, null, 'square', 'solid', 1, brush, undefined, 0, 'paint')

    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(base)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(translucentRed)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(translucentRed)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual(translucentBlue)
  })

  it('rotates intrinsic image brush stamps around the pointer', () => {
    const document = createDocument('rotated image brush', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const brush = {
      id: 'rotate.png',
      name: 'Rotate',
      width: 3,
      height: 1,
      coverage: new Uint8Array([255, 255, 255]),
      colors: new Uint32Array([packColor(red), packColor(red), packColor(red)]),
      intrinsicSize: true
    }
    paintBrush(document, layer, beginPixelEdit(layer.id), 2, 2, 1, red, 'square', null, 'solid', 1, brush, undefined, 0, 'paint', undefined, undefined, undefined, undefined, 1, undefined, false, undefined, 'off', undefined, 90)

    const painted = new Set<string>()
    for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
      if (readLayerColorAt(document, layer, x, y).a > 0) painted.add(`${x}:${y}`)
    }
    expect([...painted].sort()).toEqual(['2:1', '2:2', '2:3'])
  })

  it('rotates the line brush shape with the same angle semantics', () => {
    const mask = brushMaskOffsets(5, 'line', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, 90)
    expect(new Set(mask.map(({ x, y }) => `${x}:${y}`))).toEqual(new Set(['2:0', '2:1', '2:2', '2:3', '2:4']))
  })

  it('keeps a rotated line brush centered on the pointer pixel', () => {
    const angle = 45
    const mask = brushMaskOffsets(5, 'line', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, angle, true)
    const stamp = brushStampDimensions(5, null, angle, 'line')
    const anchor = brushStampAnchor(5, null, angle, 'line')
    expect((Math.min(...mask.map(({ x }) => x)) + Math.max(...mask.map(({ x }) => x))) / 2).toBe(anchor.x)
    expect((Math.min(...mask.map(({ y }) => y)) + Math.max(...mask.map(({ y }) => y))) / 2).toBe(anchor.y)
    expect(stamp).toEqual({ width: 5, height: 5 })
  })

  it('keeps optimized rotated line brush pixels connected at every angle', () => {
    for (const angle of [15, 30, 45, 60, 75, 120, 150, 210, 300]) {
      const mask = brushMaskOffsets(9, 'line', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, angle, true)
      expect(mask.length).toBeGreaterThan(1)
      for (let index = 1; index < mask.length; index += 1) {
        expect(Math.max(Math.abs(mask[index].x - mask[index - 1].x), Math.abs(mask[index].y - mask[index - 1].y)), `line at ${angle} degrees`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('ignores brush rotation for one-pixel square and line brushes', () => {
    expect(brushMaskOffsets(1, 'square', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, 37)).toEqual([{ x: 0, y: 0, coverage: 255 }])
    expect(brushMaskOffsets(1, 'line', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, 37)).toEqual([{ x: 0, y: 0, coverage: 255 }])
  })

  it('does not leave enclosed holes when a rotated line brush is moved quickly', () => {
    for (const [angle, from, to] of [
      [15, { x: 12, y: 48 }, { x: 116, y: 48 }],
      [30, { x: 12, y: 20 }, { x: 116, y: 72 }],
      [45, { x: 12, y: 48 }, { x: 116, y: 48 }],
      [60, { x: 12, y: 72 }, { x: 116, y: 20 }],
      [90, { x: 64, y: 12 }, { x: 64, y: 84 }],
      [135, { x: 12, y: 48 }, { x: 116, y: 48 }]
    ] as const) {
      const document = createDocument(`fast rotated line brush ${angle}`, 128, 96, 'rgba')
      const layer = getActiveLayer(document)
      paintLine(document, layer, beginPixelEdit(layer.id), from.x, from.y, to.x, to.y, 32, blue, null, 'line', 'solid', 1, null, undefined, 0, 'paint', undefined, 'raster', undefined, undefined, undefined, { fromAngle: angle, toAngle: angle }, 'off', undefined, true)
      const painted = new Set<string>()
      for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
        if (readLayerColorAt(document, layer, x, y).a > 0) painted.add(`${x}:${y}`)
      }
      let enclosedHoles = 0
      for (let y = 1; y < document.height - 1; y += 1) for (let x = 1; x < document.width - 1; x += 1) {
        if (painted.has(`${x}:${y}`)) continue
        if ([`${x - 1}:${y}`, `${x + 1}:${y}`, `${x}:${y - 1}`, `${x}:${y + 1}`].every((key) => painted.has(key))) enclosedHoles += 1
      }
      expect(enclosedHoles, `line at ${angle} degrees`).toBe(0)
    }
  })

  it('rotates solid square brush stamps instead of keeping an axis-aligned block', () => {
    const mask = brushMaskOffsets(5, 'square', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, 45)
    expect(Math.max(...mask.map(({ x }) => x))).toBeGreaterThan(4)
    expect(Math.max(...mask.map(({ y }) => y))).toBeGreaterThan(4)
    expect(mask.length).toBeLessThan(25)
  })

  it('compresses solid brush hover footprints without changing their raster pixels', () => {
    for (const [size, shape, angle] of [
      [17, 'round', 0],
      [16, 'square', 0],
      [17, 'square', 37],
      [17, 'line', 63]
    ] as const) {
      const mask = brushMaskOffsets(size, shape, 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, undefined, angle, true)
      const previewPixels = new Set<string>()
      for (const span of solidBrushPreviewRowSpans(size, shape, angle, true)) {
        for (let x = span.left; x <= span.right; x += 1) previewPixels.add(`${x}:${span.y}`)
      }
      expect(previewPixels).toEqual(new Set(mask.map(({ x, y }) => `${x}:${y}`)))
    }
  })

  it('keeps large solid hover footprints proportional to brush diameter and cached', () => {
    const square = solidBrushPreviewRowSpans(1024, 'square')
    const round = solidBrushPreviewRowSpans(1024, 'round')
    expect(square).toHaveLength(1024)
    expect(round.length).toBeLessThanOrEqual(1024)
    expect(solidBrushPreviewRowSpans(1024, 'square')).toBe(square)
    expect(solidBrushPreviewRowSpans(1024, 'round')).toBe(round)
  })

  it('invalidates only the newly exposed strip for adjacent solid stamps', () => {
    const rects = solidBrushStampDifferenceRects({ x: 64, y: 64 }, { x: 65, y: 64 }, 32, 'square')
    expect(rects.reduce((area, rect) => area + rect.width * rect.height, 0)).toBe(32)
    expect(rects.every((rect) => rect.width === 1)).toBe(true)
  })


  it('virtually closes line-art gaps and fills through the virtual bridge', () => {
    const createGappedOutline = () => {
      const document = createDocument('smart closure fill', 10, 10, 'rgba')
      const layer = getActiveLayer(document)
      for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 7; x += 1) {
        if (x !== 2 && x !== 7 && y !== 2 && y !== 7) continue
        if (y === 2 && (x === 4 || x === 5)) continue
        writeLayerColor(document, layer, y * document.width + x, blue)
      }
      return { document, layer }
    }

    const leaking = createGappedOutline()
    floodFill(leaking.document, leaking.layer, 4, 4, red)
    expect(readLayerColorAt(leaking.document, leaking.layer, 0, 0)).toEqual(red)

    const closed = createGappedOutline()
    floodFill(closed.document, closed.layer, 4, 4, red, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', 0, 2)
    expect(readLayerColorAt(closed.document, closed.layer, 4, 4)).toEqual(red)
    expect(readLayerColorAt(closed.document, closed.layer, 0, 0).a).toBe(0)
    expect(readLayerColorAt(closed.document, closed.layer, 4, 2)).toEqual(red)
    expect(readLayerColorAt(closed.document, closed.layer, 3, 2)).toEqual(blue)
  })

  it('keeps uniform large smart-closure fills compact and exactly undoable', () => {
    const document = createDocument('uniform smart closure fill', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    const edit = floodFill(document, layer, 256, 256, blue, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', 0, 2)

    expect(edit?.before.size).toBe(0)
    expect(edit?.runs).toHaveLength(512)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 511, 511)).toEqual(blue)

    const history = commitPixelEdit(document, edit!, 'smart closure fill')!
    history.undo()
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
    expect(readLayerColorAt(document, layer, 511, 511).a).toBe(0)
    history.redo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 511, 511)).toEqual(blue)
  })

  it('keeps non-uniform large smart-closure fills in compact runs and exactly undoable', () => {
    const document = createDocument('non-uniform smart closure fill', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    for (let x = 96; x <= 415; x += 1) {
      if (x !== 255 && x !== 256) writeLayerColor(document, layer, 96 * document.width + x, blue)
      writeLayerColor(document, layer, 415 * document.width + x, blue)
    }
    for (let y = 97; y < 415; y += 1) {
      writeLayerColor(document, layer, y * document.width + 96, blue)
      writeLayerColor(document, layer, y * document.width + 415, blue)
    }

    const edit = floodFill(document, layer, 256, 256, red, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', 0, 2)

    expect(edit?.before.size).toBe(0)
    expect(edit?.runs?.length).toBeGreaterThan(0)
    expect(readLayerColorAt(document, layer, 256, 256)).toEqual(red)
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
    expect(readLayerColorAt(document, layer, 255, 96)).toEqual(red)

    const history = commitPixelEdit(document, edit!, 'non-uniform smart closure fill')!
    history.undo()
    expect(readLayerColorAt(document, layer, 256, 256).a).toBe(0)
    expect(readLayerColorAt(document, layer, 255, 96).a).toBe(0)
    history.redo()
    expect(readLayerColorAt(document, layer, 256, 256)).toEqual(red)
    expect(readLayerColorAt(document, layer, 255, 96)).toEqual(red)
  })

  it('keeps a closed smart-closure fill local to a cropped layer', () => {
    const document = createDocument('cropped smart closure fill', 12, 12, 'rgba')
    const layer = getActiveLayer(document)
    layer.width = 6
    layer.height = 6
    layer.offsetX = 3
    layer.offsetY = 3
    layer.pixels = new Uint8ClampedArray(layer.width * layer.height * 4)
    for (let y = 1; y <= 4; y += 1) for (let x = 1; x <= 4; x += 1) {
      if (x !== 1 && x !== 4 && y !== 1 && y !== 4) continue
      writeLayerColor(document, layer, y * layer.width + x, blue)
    }

    const edit = floodFill(document, layer, 6, 6, red, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', 0, 2)

    expect(edit).not.toBeNull()
    expect(layer.width).toBe(6)
    expect(layer.height).toBe(6)
    expect(layer.offsetX).toBe(3)
    expect(layer.offsetY).toBe(3)
    expect(readLayerColorAt(document, layer, 6, 6)).toEqual(red)
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
  })

  it('still expands a cropped smart-closure fill that reaches its canvas-internal edge', () => {
    const document = createDocument('open cropped smart closure fill', 12, 12, 'rgba')
    const layer = getActiveLayer(document)
    layer.width = 6
    layer.height = 6
    layer.offsetX = 3
    layer.offsetY = 3
    layer.pixels = new Uint8ClampedArray(layer.width * layer.height * 4)

    const edit = floodFill(document, layer, 6, 6, red, null, true, null, 1, undefined, 'solid', 1, 0, 'paint', 0, 2)

    expect(edit).not.toBeNull()
    expect(layer.width).toBe(12)
    expect(layer.height).toBe(12)
    expect(layer.offsetX).toBe(0)
    expect(layer.offsetY).toBe(0)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
  })

  it('ignores stale smart-closure settings for large global fills', () => {
    const document = createDocument('global fill with stale smart closure', 512, 512, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 256 * document.width + 256, blue)

    const edit = floodFill(document, layer, 0, 0, red, null, false, null, 1, undefined, 'solid', 1, 0, 'paint', 0, 2)

    expect(edit?.before.size).toBe(0)
    expect(edit?.runs?.length).toBeGreaterThan(0)
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 256, 256)).toEqual(blue)

    const history = commitPixelEdit(document, edit!, 'global fill')!
    history.undo()
    expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
    expect(readLayerColorAt(document, layer, 256, 256)).toEqual(blue)
    history.redo()
    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 256, 256)).toEqual(blue)
  })

  it('fills a selected region using canvas coordinates on an offset layer', () => {
    const document = createDocument('offset fill', 6, 4, 'rgba')
    const layer = getActiveLayer(document)
    layer.offsetX = 2
    layer.offsetY = 1
    const selection = { x: 3, y: 1, width: 2, height: 2 }
    const edit = floodFill(document, layer, 3, 1, blue, selection, true)
    expect(edit?.before.size).toBe(4)
    expect(readLayerColorAt(document, layer, 3, 1)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 4, 2)).toEqual(blue)
    expect(readLayerColorAt(document, layer, 2, 1).a).toBe(0)
    expect(readLayerColorAt(document, layer, 5, 2).a).toBe(0)
  })

  it('expands a cropped layer before painting in an uncovered canvas corner', () => {
    const document = createDocument('cropped brush', 6, 5, 'rgba')
    const layer = getActiveLayer(document)
    if (layer.format !== 'rgba') throw new Error('wrong layer mode')
    layer.width = 2
    layer.height = 2
    layer.offsetX = 1
    layer.offsetY = 1
    layer.pixels = new Uint8ClampedArray(2 * 2 * 4)
    const edit = beginPixelEdit(layer.id)

    paintBrush(document, layer, edit, 5, 4, 1, blue, 'square')

    expect(readLayerColorAt(document, layer, 5, 4)).toEqual(blue)
    expect(layer.offsetX).toBe(0)
    expect(layer.offsetY).toBe(0)
    expect(layer.width).toBe(6)
    expect(layer.height).toBe(5)
  })






  it('replaces matching colors without leaving indexed mode', () => {
    const document = createDocument('replace indexed color', 2, 1, 'indexed')
    const layer = getActiveLayer(document)
    findOrAddPaletteColor(document, red, true)
    findOrAddPaletteColor(document, blue, true)
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, 1, red)

    const edit = replaceLayerColor(document, layer, red, blue)

    expect(edit?.before.size).toBe(2)
    expect(document.colorMode).toBe('indexed')
    expect(readLayerColor(document, layer, 0)).toEqual(blue)
    expect(readLayerColor(document, layer, 1)).toEqual(blue)
  })



  it('moves selected indexed pixels and clears the source', () => {
    const document = createDocument('move', 4, 4, 'indexed')
    const layer = getActiveLayer(document)
    if (layer.format !== 'indexed') throw new Error('wrong layer mode')
    layer.pixels[0] = 2
    const edit = moveSelection(document, { x: 0, y: 0, width: 1, height: 1 }, 2, 1)!
    expect(edit.before.size).toBe(2)
    expect(layer.pixels[0]).toBe(0)
    expect(layer.pixels[1 * 4 + 2]).toBe(2)
  })



















  it('replaces only exact foreground-color pixels along an eraser replacement stroke', () => {
    const document = createDocument('eraser color replacement', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    const background = { r: 245, g: 220, b: 180, a: 255 }
    writeLayerColor(document, layer, 0, blue)
    writeLayerColor(document, layer, 1, red)
    writeLayerColor(document, layer, 2, blue)
    writeLayerColor(document, layer, 3, { ...blue, a: 128 })
    const edit = beginPixelEdit(layer.id)

    paintLine(document, layer, edit, 0, 0, 3, 0, 1, background, null, 'square', 'solid', 1, null, undefined, 0, 'paint', undefined, 'raster', undefined, undefined, { source: blue, target: background })

    expect(readLayerColorAt(document, layer, 0, 0)).toEqual(background)
    expect(readLayerColorAt(document, layer, 1, 0)).toEqual(red)
    expect(readLayerColorAt(document, layer, 2, 0)).toEqual(background)
    expect(readLayerColorAt(document, layer, 3, 0)).toEqual({ ...blue, a: 128 })
    expect(edit.before.size).toBe(2)
  })



  it('uses one rounded rectangle mask for filled, outline, and sampled shape previews', () => {
    const bounds = { x: 2, y: 3, width: 8, height: 6 }
    const radius = 3
    const filled = new Set(shapePixelPoints(bounds, 'rectangle', radius).map(({ x, y }) => `${x}:${y}`))
    const outline = new Set(shapePixelPoints(bounds, 'rectangle-outline', radius).map(({ x, y }) => `${x}:${y}`))
    const topCenter = `${bounds.x + Math.floor(bounds.width / 2)}:${bounds.y}`
    const leftCenter = `${bounds.x}:${bounds.y + Math.floor(bounds.height / 2)}`
    const center = `${bounds.x + Math.floor(bounds.width / 2)}:${bounds.y + Math.floor(bounds.height / 2)}`

    expect(filled.has(`${bounds.x}:${bounds.y}`)).toBe(false)
    expect(filled.has(topCenter)).toBe(true)
    expect(filled.has(leftCenter)).toBe(true)
    expect(filled.has(center)).toBe(true)
    expect(outline.has(`${bounds.x}:${bounds.y}`)).toBe(false)
    expect(outline.has(topCenter)).toBe(true)
    expect(outline.has(center)).toBe(false)
    expect(shapePixelPoints(bounds, 'rectangle', 99)).toEqual(shapePixelPoints(bounds, 'rectangle', radius))

    for (let y = bounds.y - 1; y <= bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x - 1; x <= bounds.x + bounds.width; x += 1) {
        expect(shapeContainsPixel(bounds, 'rectangle', x, y, radius)).toBe(filled.has(`${x}:${y}`))
      }
    }
  })

  it('builds a rectangle drag preview from its contour instead of its filled area', () => {
    const bounds = { x: 10, y: 12, width: 4000, height: 3000 }
    const points = shapeBoundaryPixelPoints(bounds, 'rectangle', 5000, 5000)
    const keys = new Set(points.map(({ x, y }) => `${x}:${y}`))

    expect(points.length).toBeLessThan(2 * (bounds.width + bounds.height))
    expect(keys.has(`${bounds.x + Math.floor(bounds.width / 2)}:${bounds.y + Math.floor(bounds.height / 2)}`)).toBe(false)
    expect(points.every(({ x, y }) => x >= 0 && y >= 0 && x < 5000 && y < 5000)).toBe(true)
  })

  it('keeps ellipse and rotated rectangle drag previews on their boundaries', () => {
    const ellipse = shapeBoundaryPixelPoints({ x: 2, y: 3, width: 21, height: 13 }, 'ellipse', 32, 32)
    const ellipseKeys = new Set(ellipse.map(({ x, y }) => `${x}:${y}`))
    expect(ellipseKeys.has('12:9')).toBe(false)
    expect(ellipse.length).toBeLessThan(21 * 13)

    const rotated = shapeBoundaryPixelPoints({ x: 8, y: 7, width: 17, height: 11 }, 'rectangle', 40, 40, 37)
    const rotatedKeys = new Set(rotated.map(({ x, y }) => `${x}:${y}`))
    expect(rotated.length).toBeLessThan(17 * 11)
    expect(rotatedKeys.has('16:12')).toBe(false)
  })

  it('matches the raster shape boundary for axis-aligned drag previews', () => {
    const boundaryOf = (points: readonly { x: number; y: number }[]): Set<string> => {
      const filled = new Set(points.map(({ x, y }) => `${x}:${y}`))
      return new Set(points
        .filter(({ x, y }) => [
          `${x - 1}:${y}`,
          `${x + 1}:${y}`,
          `${x}:${y - 1}`,
          `${x}:${y + 1}`
        ].some((neighbor) => !filled.has(neighbor)))
        .map(({ x, y }) => `${x}:${y}`))
    }
    for (const [kind, radius] of [['rectangle', 0], ['rectangle', 3], ['ellipse', 0] ] as const) {
      const bounds = { x: 4, y: 5, width: 13, height: 9 }
      const filled = shapePixelPoints(bounds, kind, radius)
      const preview = shapeBoundaryPixelPoints(bounds, kind, 32, 32, 0, radius)
      expect(new Set(preview.map(({ x, y }) => `${x}:${y}`))).toEqual(boundaryOf(filled))
    }
  })

  it('keeps rotated drag contours aligned with the committed raster shape', () => {
    const boundaryOf = (points: readonly { x: number; y: number }[]): Set<string> => {
      const filled = new Set(points.map(({ x, y }) => `${x}:${y}`))
      return new Set(points
        .filter(({ x, y }) => [
          `${x - 1}:${y}`,
          `${x + 1}:${y}`,
          `${x}:${y - 1}`,
          `${x}:${y + 1}`
        ].some((neighbor) => !filled.has(neighbor)))
        .map(({ x, y }) => `${x}:${y}`))
    }
    const bounds = { x: 8, y: 7, width: 17, height: 11 }
    for (const angle of [1, 37, 45, 89, 90, 135, 179, 270]) {
      for (const kind of ['rectangle', 'ellipse'] as const) {
        const committed = rotatedShapePixelPoints(bounds, kind, 48, 48, angle)
        const preview = shapeBoundaryPixelPoints(bounds, kind, 48, 48, angle)
        const previewKeys = new Set(preview.map(({ x, y }) => `${x}:${y}`))
        const expectedKeys = boundaryOf(committed)
        expect(previewKeys, `${kind} at ${angle} degrees`).toEqual(expectedKeys)
      }
      for (const kind of ['rectangle-outline', 'ellipse-outline'] as const) {
        const committed = rotatedShapePixelPoints(bounds, kind, 48, 48, angle)
        const preview = shapeBoundaryPixelPoints(bounds, kind, 48, 48, angle)
        expect(new Set(preview.map(({ x, y }) => `${x}:${y}`)), `${kind} at ${angle} degrees`).toEqual(new Set(committed.map(({ x, y }) => `${x}:${y}`)))
      }
      const roundedCommitted = rotatedShapePixelPoints(bounds, 'rectangle', 48, 48, angle, 4)
      const roundedPreview = shapeBoundaryPixelPoints(bounds, 'rectangle', 48, 48, angle, 4)
      expect(new Set(roundedPreview.map(({ x, y }) => `${x}:${y}`)), `rounded rectangle at ${angle} degrees`).toEqual(boundaryOf(roundedCommitted))
    }
  })



  it('keeps line and cubic curve paths continuous and includes both endpoints', () => {
    const line = lineShapePixelPoints({ x: 1, y: 1 }, { x: 9, y: 6 }, true)
    const curve = bezierCurvePixelPoints({ x: 1, y: 8 }, [{ x: 3, y: 0 }, { x: 8, y: 0 }], { x: 10, y: 8 })
    expect(line[0]).toMatchObject({ x: 1, y: 1 })
    expect(line.at(-1)).toMatchObject({ x: 9, y: 6 })
    expect(curve[0]).toMatchObject({ x: 1, y: 8 })
    expect(curve.at(-1)).toMatchObject({ x: 10, y: 8 })
    for (const points of [line, curve]) {
      for (let index = 1; index < points.length; index += 1) {
        expect(Math.max(Math.abs(points[index].x - points[index - 1].x), Math.abs(points[index].y - points[index - 1].y))).toBeLessThanOrEqual(1)
      }
    }
  })






  it('commits exactly the same pixels shown by a rotated shape preview', () => {
    const document = createDocument('rotated shape preview', 24, 24, 'rgba')
    const layer = getActiveLayer(document)
    const bounds = { x: 5, y: 7, width: 11, height: 7 }
    const angle = 37
    const preview = rotatedShapePixelPoints(bounds, 'rectangle', document.width, document.height, angle)
    const edit = beginPixelEdit(layer.id)

    paintShape(document, layer, edit, bounds, 'rectangle', blue, null, undefined, undefined, angle)

    expect([...edit.before.keys()].sort((left, right) => left - right)).toEqual(
      preview.map(({ x, y }) => y * document.width + x).sort((left, right) => left - right)
    )
  })

  it('uses the same absolute dither mask for brush preview data and committed pixels', () => {
    const document = createDocument('dither brush', 4, 4, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    const dither = { enabled: true, template: 'bayer-2' as const, stage: 2 }
    const previewMask = brushMaskOffsets(4, 'square', 'solid', 1, 0, 0, null, undefined, 0, 'paint', 0, 0, dither)

    paintBrush(document, layer, edit, 2, 2, 4, blue, 'square', null, 'solid', 1, null, undefined, 0, 'paint', undefined, undefined, undefined, undefined, 1, undefined, false, undefined, 'off', dither)

    const previewPixels = previewMask.map((point) => `${point.x}:${point.y}`).sort()
    const paintedPixels: string[] = []
    for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
      if (readLayerColorAt(document, layer, x, y).a > 0) paintedPixels.push(`${x}:${y}`)
    }
    expect(previewPixels).toHaveLength(8)
    expect(paintedPixels.sort()).toEqual(previewPixels)
  })






















  it('outlines selected content outside and inside as a single pixel edit', () => {
    const outsideDocument = createDocument('outside outline', 5, 5, 'rgba')
    const outsideLayer = getActiveLayer(outsideDocument)
    paintLine(outsideDocument, outsideLayer, beginPixelEdit(outsideLayer.id), 2, 2, 2, 2, 1, blue)
    const outside = outlineSelection(outsideDocument, outsideLayer, { x: 1, y: 1, width: 3, height: 3 }, { r: 255, g: 0, b: 0, a: 255 }, 1, 'outside')!
    expect(outside.before.size).toBe(8)
    expect(readLayerColor(outsideDocument, outsideLayer, 2 * 5 + 2)).toEqual(blue)

    const insideDocument = createDocument('inside outline', 3, 3, 'rgba')
    const insideLayer = getActiveLayer(insideDocument)
    paintShape(insideDocument, insideLayer, beginPixelEdit(insideLayer.id), { x: 0, y: 0, width: 3, height: 3 }, 'rectangle', blue)
    const inside = outlineSelection(insideDocument, insideLayer, { x: 0, y: 0, width: 3, height: 3 }, { r: 255, g: 0, b: 0, a: 255 }, 1, 'inside')!
    expect(inside.before.size).toBe(8)
    expect(readLayerColor(insideDocument, insideLayer, 4)).toEqual(blue)
  })

  it('strokes an empty selection along its inside boundary', () => {
    const document = createDocument('empty selection boundary', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const edit = outlineSelectionBoundary(document, layer, { x: 1, y: 1, width: 3, height: 3 }, { r: 255, g: 0, b: 0, a: 255 }, 1)
    expect(edit).not.toBeNull()
    expect(edit?.before.size).toBe(8)
  })

  it('treats the configured background color as existing outline instead of source content', () => {
    const document = createDocument('background-aware outline', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    paintShape(document, layer, beginPixelEdit(layer.id), { x: 1, y: 1, width: 3, height: 3 }, 'rectangle', blue)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 3, 1, 1, black)

    const outlined = new Set(outlinePixelIndices(document, layer, null, 1, 'outside', undefined, 'square', black))
    expect([...outlined].every((index) => Math.floor(index / 5) > 0)).toBe(true)
    expect(outlined.has(4 * 5 + 2)).toBe(true)
  })

  it('fills only the intersection of horizontal and vertical outline samples', () => {
    const document = createDocument('quick anti-alias', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 3, 3, 1, blue)

    const color = { r: 255, g: 0, b: 0, a: 255 }
    const edit = antiAliasSelection(document, layer, null, color)

    expect(edit).not.toBeNull()
    expect(readLayerColor(document, layer, 1 * 5 + 2)).toEqual(color)
    expect(readLayerColor(document, layer, 2 * 5 + 1)).toEqual(color)
    expect(readLayerColor(document, layer, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('selects the dominant surrounding source color for each anti-alias pixel', () => {
    const document = createDocument('automatic anti-alias color', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 2, 1, blue)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, red)

    const edit = antiAliasSelection(document, layer, null, null)

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual({ ...blue, a: 128 })
  })

  it('restricts automatic anti-alias colors to the document palette and matches luminance', () => {
    const document = createDocument('palette anti-alias color', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const orange = { r: 220, g: 100, b: 20, a: 255 }
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 3, 3, 1, orange)

    const edit = antiAliasSelection(document, layer, null, null, 25, false, 'palette')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual({ r: 41, g: 121, b: 255, a: 255 })
  })

  it('chooses the palette color at the midpoint of the two source relative luminances', () => {
    const document = createDocument('palette brightness midpoint', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const first = { r: 0x4d, g: 0x79, b: 0x17, a: 255 }
    const second = { r: 0x35, g: 0x91, b: 0x53, a: 255 }
    const midpoint = { r: 100, g: 133, b: 40, a: 255 }
    document.palette = [
      { id: 0, name: 'transparent', color: { r: 0, g: 0, b: 0, a: 0 } },
      { id: 1, name: 'first', color: first },
      { id: 2, name: 'second', color: second },
      { id: 3, name: 'midpoint', color: midpoint }
    ]
    document.paletteOrder = [0, 1, 2, 3]
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 1, 1, first)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, second)

    const edit = antiAliasSelection(document, layer, null, null, 1, false, 'palette')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual(midpoint)
  })

  it('does not confuse HSV brightness with relative luminance when choosing a palette color', () => {
    const document = createDocument('palette relative luminance midpoint', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const first = { r: 0x4d, g: 0x79, b: 0x17, a: 255 }
    const second = { r: 0x35, g: 0x91, b: 0x53, a: 255 }
    const lowerRelativeLuminance = { r: 0x4a, g: 0x70, b: 0x85, a: 255 }
    const middleRelativeLuminance = { r: 0x6b, g: 0x87, b: 0x3f, a: 255 }
    document.palette = [
      { id: 0, name: 'transparent', color: { r: 0, g: 0, b: 0, a: 0 } },
      { id: 1, name: 'first', color: first },
      { id: 2, name: 'second', color: second },
      { id: 3, name: 'lower relative luminance', color: lowerRelativeLuminance },
      { id: 4, name: 'middle relative luminance', color: middleRelativeLuminance }
    ]
    document.paletteOrder = [0, 1, 2, 3, 4]
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 1, 1, first)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, second)
    paintLine(document, layer, beginPixelEdit(layer.id), 4, 4, 4, 4, 1, lowerRelativeLuminance)
    paintLine(document, layer, beginPixelEdit(layer.id), 3, 4, 3, 4, 1, middleRelativeLuminance)

    const edit = antiAliasSelection(document, layer, null, null, 1, false, 'palette')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual(middleRelativeLuminance)
  })

  it('uses only the current palette after switching away from an old palette', () => {
    const document = createDocument('switched palette anti-alias color', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const first = { r: 0, g: 0, b: 0, a: 255 }
    const second = { r: 255, g: 255, b: 255, a: 255 }
    const oldPaletteMidpoint = { r: 120, g: 120, b: 120, a: 255 }
    const currentPaletteColor = { r: 220, g: 40, b: 40, a: 255 }
    document.palette = [
      { id: 0, name: 'transparent', color: { r: 0, g: 0, b: 0, a: 0 } },
      { id: 1, name: 'first', color: first },
      { id: 2, name: 'second', color: second },
      { id: 3, name: 'old midpoint', color: oldPaletteMidpoint },
      { id: 4, name: 'current color', color: currentPaletteColor }
    ]
    document.paletteOrder = [0, 1, 2, 4]
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 1, 1, first)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, second)

    const edit = antiAliasSelection(document, layer, null, null, 1, false, 'palette')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual(currentPaletteColor)
  })

  it('keeps canvas-source anti-alias colors opaque regardless of the opacity setting', () => {
    const document = createDocument('canvas anti-alias opacity', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 2, 1, blue)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, red)

    const edit = antiAliasSelection(document, layer, null, null, 1, false, 'canvas')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual({ ...blue, a: 255 })
  })

  it('chooses an existing canvas color between the two reference luminances', () => {
    const document = createDocument('canvas luminance midpoint', 7, 7, 'rgba')
    const layer = getActiveLayer(document)
    const light = { r: 255, g: 255, b: 255, a: 255 }
    const dark = { r: 0, g: 0, b: 0, a: 255 }
    const midpoint = { r: 128, g: 128, b: 128, a: 255 }
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 1, 1, light)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, dark)
    paintLine(document, layer, beginPixelEdit(layer.id), 5, 5, 5, 5, 1, midpoint)

    const edit = antiAliasSelection(document, layer, null, null, 1, false, 'canvas')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual(midpoint)
  })

  it('applies the configured opacity to automatic anti-alias colors', () => {
    const document = createDocument('automatic anti-alias opacity', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 2, 1, blue)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 2, 2, 1, red)

    const edit = antiAliasSelection(document, layer, null, null, 25)

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual({ ...blue, a: 64 })
  })

  it('does not paint outside a selection', () => {
    const document = createDocument('selection-scoped anti-alias', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 1, 1, 1, blue)

    const edit = antiAliasSelection(document, layer, { x: 1, y: 1, width: 1, height: 1 }, { r: 255, g: 0, b: 0, a: 255 })

    expect(edit).toBeNull()
    expect(readLayerColorAt(document, layer, 2, 1)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('can include an opaque interior color as an anti-alias source', () => {
    const document = createDocument('interior anti-alias color', 7, 7, 'rgba')
    const layer = getActiveLayer(document)
    const yellow = { r: 255, g: 204, b: 64, a: 255 }
    const brown = { r: 149, g: 109, b: 0, a: 255 }
    paintShape(document, layer, beginPixelEdit(layer.id), { x: 1, y: 1, width: 5, height: 5 }, 'rectangle', yellow)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 4, 4, 1, brown)

    const withoutInteriorColor = antiAliasSelection(document, layer, null, null, 100)
    expect(withoutInteriorColor).toBeNull()
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(yellow)

    const withInteriorColor = antiAliasSelection(document, layer, null, null, 100, true)
    expect(withInteriorColor).not.toBeNull()
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(brown)
  })

  it('uses both sides of an interior boundary when selecting a palette midpoint', () => {
    const document = createDocument('interior palette midpoint', 7, 7, 'rgba')
    const layer = getActiveLayer(document)
    const outer = { r: 255, g: 204, b: 64, a: 255 }
    const inner = { r: 149, g: 109, b: 0, a: 255 }
    const midpoint = { r: 169, g: 169, b: 169, a: 255 }
    document.palette = [
      { id: 0, name: 'transparent', color: { r: 0, g: 0, b: 0, a: 0 } },
      { id: 1, name: 'outer', color: outer },
      { id: 2, name: 'inner', color: inner },
      { id: 3, name: 'midpoint', color: midpoint }
    ]
    document.paletteOrder = [0, 1, 2, 3]
    paintShape(document, layer, beginPixelEdit(layer.id), { x: 1, y: 1, width: 5, height: 5 }, 'rectangle', outer)
    paintLine(document, layer, beginPixelEdit(layer.id), 2, 2, 4, 4, 1, inner)

    const edit = antiAliasSelection(document, layer, null, null, 1, true, 'palette')

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(midpoint)
  })

  it('keeps processing an interior boundary when the same region also reaches the outer edge', () => {
    const document = createDocument('mixed interior boundary', 7, 7, 'rgba')
    const layer = getActiveLayer(document)
    const yellow = { r: 255, g: 204, b: 64, a: 255 }
    const blue = { r: 32, g: 96, b: 192, a: 255 }
    paintShape(document, layer, beginPixelEdit(layer.id), { x: 1, y: 1, width: 5, height: 5 }, 'rectangle', yellow)
    paintLine(document, layer, beginPixelEdit(layer.id), 1, 1, 3, 3, 1, blue)

    const edit = antiAliasSelection(document, layer, null, null, 100, true)

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 3, 2)).toEqual(blue)
  })

















  it('does not duplicate pixels when rotating rectangular layer content', () => {
    const document = createDocument('rotate rectangular layer content', 16, 16, 'rgba')
    const layer = getActiveLayer(document)
    const rows = [
      '.RRRR...',
      'RB..BR..',
      'R....R..',
      'R....R..',
      'R..RRRRR',
      'R...RRR.',
      '....R...'
    ]
    for (let localY = 0; localY < rows.length; localY += 1) {
      for (let localX = 0; localX < rows[localY].length; localX += 1) {
        const pixel = rows[localY][localX]
        if (pixel === '.') continue
        writeLayerColor(document, layer, (2 + localY) * document.width + 2 + localX, pixel === 'B' ? blue : red)
      }
    }
    const selection = { x: 2, y: 2, width: 8, height: 7 }
    const source = captureSelectionTransform(document, selection)!

    applySelectionTransform(document, source, selection, 82)

    let opaqueCount = 0
    for (let y = 0; y < document.height; y += 1) {
      for (let x = 0; x < document.width; x += 1) {
        if (readLayerColorAt(document, layer, x, y).a > 0) opaqueCount += 1
      }
    }
    expect(opaqueCount).toBe(23)
  })

  it('uses the RotSprite selection path only while optimized rotation is enabled', () => {
    const document = createDocument('selection RotSprite switch', 16, 16, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 5, y: 5, width: 5, height: 5 }
    const pattern = [
      [0, 1, 2, 0, 0],
      [1, 1, 0, 0, 2],
      [0, 2, 1, 1, 0],
      [0, 0, 2, 0, 1],
      [1, 0, 0, 2, 1]
    ]
    for (let localY = 0; localY < pattern.length; localY += 1) for (let localX = 0; localX < pattern[localY].length; localX += 1) {
      if (pattern[localY][localX] !== 0) writeLayerColor(document, layer, (selection.y + localY) * document.width + selection.x + localX, pattern[localY][localX] === 1 ? red : blue)
    }
    const source = captureSelectionTransform(document, selection, layer)!
    let differs = false
    let optimized: Uint32Array<ArrayBufferLike> = new Uint32Array(0)
    for (let angle = 1; angle < 90 && !differs; angle += 1) {
      optimized = selectionTransformPreviewPacked(document, source, selection, 0, 0, document.width, document.height, angle, undefined, layer, undefined, undefined, true)
      const regular = selectionTransformPreviewPacked(document, source, selection, 0, 0, document.width, document.height, angle, undefined, layer, undefined, undefined, false)
      differs = !Array.from(optimized).every((value, index) => value === regular[index])
    }

    expect(differs).toBe(true)
    expect(Array.from(optimized).some((value) => value !== 0)).toBe(true)
  })

  it('keeps padded selections from changing the rotated content raster', () => {
    const pattern = [
      [0, 1, 0, 0, 2],
      [1, 1, 1, 2, 0],
      [0, 2, 1, 1, 0],
      [0, 0, 2, 1, 1],
      [2, 0, 0, 1, 0]
    ]
    const render = (selection: { x: number; y: number; width: number; height: number }): number[] => {
      const document = createDocument('RotSprite tight content bounds', 32, 32, 'rgba')
      const layer = getActiveLayer(document)
      for (let localY = 0; localY < 5; localY += 1) for (let localX = 0; localX < 5; localX += 1) {
        const value = pattern[localY][localX]
        if (value !== 0) writeLayerColor(document, layer, (12 + localY) * document.width + 12 + localX, value === 1 ? red : blue)
      }
      const source = captureSelectionTransform(document, selection, layer)!
      applySelectionTransform(document, source, selection, 45, false, undefined, undefined, undefined, layer, undefined, undefined, false, true)
      return Array.from({ length: document.width * document.height }, (_, index) => packColor(readLayerColorAt(document, layer, index % document.width, Math.floor(index / document.width))))
    }

    expect(render({ x: 12, y: 12, width: 5, height: 5 }))
      .toEqual(render({ x: 10, y: 10, width: 9, height: 9 }))
  })

  it('keeps Aseprite-style 45-degree solid rotations connected', () => {
    const document = createDocument('RotSprite solid 45 degrees', 32, 32, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 12, y: 12, width: 7, height: 7 }
    for (let y = selection.y; y < selection.y + selection.height; y += 1) {
      for (let x = selection.x; x < selection.x + selection.width; x += 1) writeLayerColor(document, layer, y * document.width + x, red)
    }
    const source = captureSelectionTransform(document, selection, layer)!
    const preview = selectionTransformPreviewPacked(document, source, selection, 0, 0, document.width, document.height, 45, undefined, layer, undefined, undefined, true)
    const painted = new Set<string>()
    for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
      if (preview[y * document.width + x] !== 0) painted.add(`${x}:${y}`)
    }
    expect(painted.size).toBeGreaterThan(0)
    for (const key of painted) {
      const [x, y] = key.split(':').map(Number)
      const connected = painted.has(`${x - 1}:${y}`) || painted.has(`${x + 1}:${y}`)
        || painted.has(`${x}:${y - 1}`) || painted.has(`${x}:${y + 1}`)
      expect(connected, `isolated pixel at ${key}`).toBe(true)
    }
  })

  it('keeps RotSprite thin lines continuous at 45 degrees', () => {
    const document = createDocument('RotSprite thin line 45 degrees', 32, 32, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 10, y: 14, width: 9, height: 1 }
    for (let x = selection.x; x < selection.x + selection.width; x += 1) writeLayerColor(document, layer, selection.y * document.width + x, red)
    const source = captureSelectionTransform(document, selection, layer)!
    const preview = selectionTransformPreviewPacked(document, source, selection, 0, 0, document.width, document.height, 45, undefined, layer, undefined, undefined, true)
    const painted = new Set<string>()
    for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) {
      if (preview[y * document.width + x] !== 0) painted.add(`${x}:${y}`)
    }
    expect(painted.size).toBeGreaterThan(1)
    let edgeCount = 0
    for (const key of painted) {
      const [x, y] = key.split(':').map(Number)
      const neighbors = [
        painted.has(`${x - 1}:${y - 1}`), painted.has(`${x}:${y - 1}`), painted.has(`${x + 1}:${y - 1}`),
        painted.has(`${x - 1}:${y}`), painted.has(`${x + 1}:${y}`),
        painted.has(`${x - 1}:${y + 1}`), painted.has(`${x}:${y + 1}`), painted.has(`${x + 1}:${y + 1}`)
      ].filter(Boolean).length
      if (neighbors === 1) edgeCount += 1
      expect(neighbors).toBeGreaterThan(0)
    }
    expect(edgeCount).toBe(2)
  })

  it('does not rotate pixels outside the selection mask', () => {
    const document = createDocument('RotSprite masked selection', 32, 32, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 12, y: 12, width: 7, height: 7, mask: new Uint8Array(49).fill(1) }
    for (let y = selection.y; y < selection.y + selection.height; y += 1) {
      for (let x = selection.x; x < selection.x + selection.width; x += 1) writeLayerColor(document, layer, y * document.width + x, red)
    }
    const fullSource = captureSelectionTransform(document, selection, layer)!
    const fullPreview = selectionTransformPreviewPacked(document, fullSource, selection, 0, 0, document.width, document.height, 45, undefined, layer, undefined, undefined, true)
    selection.mask.fill(0)
    for (let y = 2; y < 5; y += 1) for (let x = 2; x < 5; x += 1) selection.mask[y * selection.width + x] = 1
    const maskedSource = captureSelectionTransform(document, selection, layer)!
    const maskedPreview = selectionTransformPreviewPacked(document, maskedSource, selection, 0, 0, document.width, document.height, 45, undefined, layer, undefined, undefined, true)
    const count = (pixels: Uint32Array): number => Array.from(pixels).filter((value) => value !== 0).length
    expect(count(maskedPreview)).toBeGreaterThan(0)
    expect(count(maskedPreview)).toBeLessThan(count(fullPreview))
  })

  it('keeps a RotSprite interior marker at the rotation centre', () => {
    const document = createDocument('RotSprite interior marker', 32, 32, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 12, y: 12, width: 7, height: 7 }
    for (let y = selection.y; y < selection.y + selection.height; y += 1) for (let x = selection.x; x < selection.x + selection.width; x += 1) writeLayerColor(document, layer, y * document.width + x, red)
    writeLayerColor(document, layer, 15 * document.width + 15, blue)
    const source = captureSelectionTransform(document, selection, layer)!
    const preview = selectionTransformPreviewPacked(document, source, selection, 0, 0, document.width, document.height, 45, undefined, layer, undefined, undefined, true)
    const bluePixels: string[] = []
    for (let y = 0; y < document.height; y += 1) for (let x = 0; x < document.width; x += 1) if (preview[y * document.width + x] === packColor(blue)) bluePixels.push(`${x}:${y}`)
    expect(bluePixels).toEqual(['15:15'])
  })

  it('commits a four-corner transform from captured pixels without retaining the source', () => {
    const document = createDocument('quad transform content', 12, 12, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 1, y: 1, width: 2, height: 2 }
    writeLayerColor(document, layer, 1 * document.width + 1, red)
    writeLayerColor(document, layer, 1 * document.width + 2, blue)
    writeLayerColor(document, layer, 2 * document.width + 1, blue)
    writeLayerColor(document, layer, 2 * document.width + 2, red)
    const source = captureSelectionTransform(document, selection, layer)!
    const quad = {
      nw: { x: 4, y: 2 },
      ne: { x: 8, y: 2 },
      se: { x: 7, y: 7 },
      sw: { x: 3, y: 7 }
    }

    const edit = applySelectionTransform(
      document,
      source,
      { x: 4, y: 2, width: 4, height: 5 },
      0,
      false,
      undefined,
      undefined,
      undefined,
      layer,
      undefined,
      quad
    )

    expect(edit).not.toBeNull()
    expect(readLayerColorAt(document, layer, 1, 1).a).toBe(0)
    expect(readLayerColorAt(document, layer, 2, 2).a).toBe(0)
    expect(readLayerColorAt(document, layer, 4, 2).a).toBe(255)
    expect(readLayerColorAt(document, layer, 6, 6).a).toBe(255)
  })

  it('uses the previous free-transform quad as the source frame on repeated transforms', () => {
    const document = createDocument('repeated quad transform', 16, 16, 'rgba')
    const layer = getActiveLayer(document)
    const selection = { x: 3, y: 3, width: 4, height: 4 }
    for (let y = 0; y < selection.height; y += 1) for (let x = 0; x < selection.width; x += 1) {
      writeLayerColor(document, layer, (selection.y + y) * document.width + selection.x + x, {
        r: x * 60,
        g: y * 60,
        b: 120,
        a: 255
      })
    }
    const source = captureSelectionTransform(document, selection, layer)!
    const quad = {
      nw: { x: 2, y: 2 },
      ne: { x: 10, y: 3 },
      se: { x: 9, y: 11 },
      sw: { x: 1, y: 10 }
    }
    source.sourceQuad = quad
    const bounds = selectionQuadBounds(quad)
    const withSourceFrame = selectionTransformPreviewPacked(
      document,
      source,
      bounds,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      undefined,
      layer,
      undefined,
      quad
    )
    const withoutSourceFrame = selectionTransformPreviewPacked(
      document,
      { ...source, sourceQuad: undefined },
      bounds,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      undefined,
      layer,
      undefined,
      quad
    )

    expect(Array.from(withSourceFrame)).not.toEqual(Array.from(withoutSourceFrame))
    expect(Array.from(withSourceFrame).some((value) => value !== 0)).toBe(true)
  })




  it('selects only the contiguous exact-color region with the magic wand', () => {
    const document = createDocument('wand', 4, 1, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    paintLine(document, layer, edit, 2, 0, 2, 0, 1, blue)
    const selection = magicWandSelection(document, layer, 0, 0)
    expect(selectionContains(selection, 0, 0)).toBe(true)
    expect(selectionContains(selection, 1, 0)).toBe(true)
    expect(selectionContains(selection, 2, 0)).toBe(false)
  })

  it('uses the same virtual gap boundary for smart-closure magic-wand selections', () => {
    const document = createDocument('smart closure wand', 10, 10, 'rgba')
    const layer = getActiveLayer(document)
    for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 7; x += 1) {
      if (x !== 2 && x !== 7 && y !== 2 && y !== 7) continue
      if (y === 2 && (x === 4 || x === 5)) continue
      writeLayerColor(document, layer, y * document.width + x, blue)
    }

    const leaking = magicWandSelection(document, layer, 4, 4)
    const closed = magicWandSelection(document, layer, 4, 4, 0, true, 2)

    expect(selectionContains(leaking, 0, 0)).toBe(true)
    expect(selectionContains(closed, 4, 4)).toBe(true)
    expect(selectionContains(closed, 0, 0)).toBe(false)
    expect(selectionContains(closed, 4, 2)).toBe(true)
  })













  it('paints every enabled symmetry result in one pixel edit', () => {
    const document = createDocument('symmetric brush', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    const edit = beginPixelEdit(layer.id)
    paintBrush(document, layer, edit, 0, 1, 1, blue, 'square', null, 'solid', 1, null, undefined, 0, 'paint', undefined, { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: true })

    expect(edit.after.size).toBe(8)
    expect([[0, 1], [0, 3], [4, 1], [1, 0], [4, 3], [3, 0], [1, 4], [3, 4]].every(([x, y]) => readLayerColorAt(document, layer, x, y).a === 255)).toBe(true)
  })





  it('treats background layers as transparent unless a background layer is active', () => {
    const document = createDocument('background sampling', 1, 1, 'rgba')
    const background = getActiveLayer(document)
    background.background = { mode: 'canvas' }
    writeLayerColor(document, background, 0, { r: 0, g: 0, b: 255, a: 255 })
    const foreground = createLayer('Foreground', 1, 1, 'rgba')
    writeLayerColor(document, foreground, 0, { r: 255, g: 0, b: 0, a: 128 })
    document.layers.push(foreground)

    expect(sampleCompositeColor(document, 0, 0, foreground.id)).toEqual({ r: 255, g: 0, b: 0, a: 128 })
    expect(sampleCompositeColor(document, 0, 0, background.id)).toEqual({ r: 128, g: 0, b: 127, a: 255 })
  })
})
