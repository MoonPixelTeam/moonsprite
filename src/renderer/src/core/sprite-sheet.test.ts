import { describe, expect, it } from 'vitest'
import { addBlankAnimationFrame, animationCelAt, ensureAnimationDocument } from './animation'
import { createDocument, createLayer, getActiveLayer, writeLayerColor } from './document'
import { createHorizontalSpriteSheetDocument, createSpriteSheetDocument, createSpriteSheetExportTargets, resolveSpriteSheetLayerIds, spriteSheetLayoutMetrics, stackSpriteSheetDocuments, type SpriteSheetBuildOptions } from './sprite-sheet'

const buildOptions = (overrides: Partial<SpriteSheetBuildOptions> = {}): SpriteSheetBuildOptions => ({
  layout: 'columns',
  constraint: 'none',
  fixedColumns: 2,
  fixedWidth: 2,
  fixedRows: 2,
  fixedHeight: 2,
  mergeDuplicates: false,
  ignoreEmpty: false,
  area: { x: 0, y: 0, width: 1, height: 1 },
  frameIds: [],
  layerIds: null,
  ...overrides
})

const addRgbaFrame = (document: ReturnType<typeof createDocument>, pixels: number[]): string => {
  const frameId = addBlankAnimationFrame(document)
  animationCelAt(ensureAnimationDocument(document), document.activeLayerId, frameId)!.surface = {
    format: 'rgba',
    width: document.width,
    height: document.height,
    offsetX: 0,
    offsetY: 0,
    pixels: Uint8ClampedArray.from(pixels)
  }
  const activeLayer = getActiveLayer(document)
  activeLayer.width = document.width
  activeLayer.height = document.height
  activeLayer.offsetX = 0
  activeLayer.offsetY = 0
  activeLayer.pixels = Uint8ClampedArray.from(pixels)
  return frameId
}

describe('sprite sheet document creation', () => {
  it('composites animation frames from left to right into one RGBA layer', () => {
    const source = createDocument('source', 2, 1, 'rgba')
    const layer = getActiveLayer(source)
    writeLayerColor(source, layer, 0, { r: 255, g: 0, b: 0, a: 255 })

    const secondFrameId = addBlankAnimationFrame(source)
    animationCelAt(ensureAnimationDocument(source), layer.id, secondFrameId)!.surface = {
      format: 'rgba',
      width: 2,
      height: 1,
      offsetX: 0,
      offsetY: 0,
      pixels: Uint8ClampedArray.from([
        0, 0, 0, 0,
        0, 80, 255, 255
      ])
    }

    const sheet = createHorizontalSpriteSheetDocument(source, {
      document: 'source - sprite sheet',
      layer: 'sprite sheet'
    })

    expect(sheet).toMatchObject({
      name: 'source - sprite sheet',
      width: 4,
      height: 1,
      colorMode: 'rgba'
    })
    expect(sheet.layers).toHaveLength(1)
    expect(sheet.groups).toHaveLength(0)
    expect(ensureAnimationDocument(sheet).frames).toHaveLength(1)
    expect(getActiveLayer(sheet).name).toBe('sprite sheet')
    expect(Array.from(getActiveLayer(sheet).pixels)).toEqual([
      255, 0, 0, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
      0, 80, 255, 255
    ])
  })

  it('places fixed grids in row-major or column-major order', () => {
    const source = createDocument('grid', 1, 1, 'rgba')
    writeLayerColor(source, getActiveLayer(source), 0, { r: 255, g: 0, b: 0, a: 255 })
    const greenFrame = addRgbaFrame(source, [0, 255, 0, 255])
    const blueFrame = addRgbaFrame(source, [0, 0, 255, 255])
    const frameIds = [ensureAnimationDocument(source).frames[0].id, greenFrame, blueFrame]

    const rows = createSpriteSheetDocument(source, { document: 'rows', layer: 'sheet' }, buildOptions({ layout: 'rows', constraint: 'fixed-columns', fixedColumns: 2, frameIds })).document
    const columns = createSpriteSheetDocument(source, { document: 'columns', layer: 'sheet' }, buildOptions({ layout: 'columns', constraint: 'fixed-rows', fixedRows: 2, frameIds })).document

    expect(rows).toMatchObject({ width: 2, height: 2 })
    expect(Array.from(getActiveLayer(rows).pixels)).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 0, 0, 0, 0
    ])
    expect(Array.from(getActiveLayer(columns).pixels)).toEqual([
      255, 0, 0, 255, 0, 0, 255, 255,
      0, 255, 0, 255, 0, 0, 0, 0
    ])
  })

  it('uses one column or row without constraints and clamps fixed pixel dimensions to one item', () => {
    const base = { fixedColumns: 2, fixedWidth: 5, fixedRows: 2, fixedHeight: 3 }
    expect(spriteSheetLayoutMetrics(3, 2, 1, {
      ...base, layout: 'rows', constraint: 'none'
    })).toEqual({ columns: 3, rows: 1, width: 6, height: 1 })
    expect(spriteSheetLayoutMetrics(3, 2, 1, {
      ...base, layout: 'columns', constraint: 'none'
    })).toEqual({ columns: 1, rows: 3, width: 2, height: 3 })
    expect(spriteSheetLayoutMetrics(3, 2, 1, {
      ...base, layout: 'rows', constraint: 'fixed-width', fixedWidth: 1
    })).toEqual({ columns: 1, rows: 3, width: 2, height: 3 })
    expect(spriteSheetLayoutMetrics(3, 2, 2, {
      ...base, layout: 'columns', constraint: 'fixed-height', fixedHeight: 1
    })).toEqual({ columns: 3, rows: 1, width: 6, height: 2 })
    expect(spriteSheetLayoutMetrics(3, 2, 1, {
      ...base, layout: 'rows', constraint: 'fixed-width'
    })).toEqual({ columns: 2, rows: 2, width: 5, height: 2 })
    expect(spriteSheetLayoutMetrics(3, 2, 1, {
      ...base, layout: 'columns', constraint: 'fixed-height', fixedHeight: 2
    })).toEqual({ columns: 2, rows: 2, width: 4, height: 2 })
    expect(spriteSheetLayoutMetrics(5, 2, 1, {
      ...base, layout: 'rows', constraint: 'fixed-columns', fixedColumns: 2
    })).toEqual({ columns: 2, rows: 3, width: 4, height: 3 })
    expect(spriteSheetLayoutMetrics(5, 2, 1, {
      ...base, layout: 'columns', constraint: 'fixed-rows', fixedRows: 2
    })).toEqual({ columns: 3, rows: 2, width: 6, height: 2 })
  })

  it('crops the requested area, removes empty frames, then merges duplicate pixels', () => {
    const source = createDocument('filtered', 2, 1, 'rgba')
    writeLayerColor(source, getActiveLayer(source), 1, { r: 255, g: 0, b: 0, a: 255 })
    const emptyFrame = addRgbaFrame(source, [0, 0, 0, 0, 0, 0, 0, 0])
    const duplicateFrame = addRgbaFrame(source, [0, 0, 0, 0, 255, 0, 0, 255])
    const blueFrame = addRgbaFrame(source, [0, 0, 0, 0, 0, 0, 255, 255])
    const result = createSpriteSheetDocument(source, { document: 'filtered', layer: 'sheet' }, buildOptions({
      layout: 'horizontal',
      area: { x: 1, y: 0, width: 1, height: 1 },
      frameIds: [ensureAnimationDocument(source).frames[0].id, emptyFrame, duplicateFrame, blueFrame],
      ignoreEmpty: true,
      mergeDuplicates: true
    }))

    expect(result).toMatchObject({ itemCount: 2, sourceItemCount: 4 })
    expect(result.document).toMatchObject({ width: 2, height: 1 })
    expect(Array.from(getActiveLayer(result.document).pixels)).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 255
    ])
  })

  it('exports only pixels inside an irregular selection', () => {
    const source = createDocument('selection', 2, 1, 'rgba')
    const layer = getActiveLayer(source)
    writeLayerColor(source, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
    writeLayerColor(source, layer, 1, { r: 0, g: 255, b: 0, a: 255 })
    const result = createSpriteSheetDocument(source, { document: 'selection', layer: 'sheet' }, buildOptions({
      layout: 'horizontal',
      area: { x: 0, y: 0, width: 2, height: 1 },
      selection: { x: 0, y: 0, width: 2, height: 1, mask: Uint8Array.from([1, 0]) },
      frameIds: [ensureAnimationDocument(source).activeFrameId]
    }))
    expect(Array.from(getActiveLayer(result.document).pixels)).toEqual([255, 0, 0, 255, 0, 255, 0, 0])
  })





  it('stacks split targets below one another in a single sprite sheet document', () => {
    const source = createDocument('stacked', 1, 1, 'rgba')
    const bottom = getActiveLayer(source)
    bottom.name = 'Bottom'
    writeLayerColor(source, bottom, 0, { r: 255, g: 0, b: 0, a: 255 })
    const top = createLayer('Top', 1, 1, 'rgba')
    source.layers.push(top)
    writeLayerColor(source, top, 0, { r: 0, g: 0, b: 255, a: 255 })
    ensureAnimationDocument(source)
    const targets = createSpriteSheetExportTargets(source, {
      selectedLayerIds: [], selectedGroupIds: [], selectedFrameIds: []
    }, { layerScope: 'all', splitLayers: true, frameScope: 'all', splitLoopSections: false })
    const parts = targets.map((target) => createSpriteSheetDocument(source, { document: 'part', layer: 'part' }, buildOptions({
      layout: 'rows',
      frameIds: target.frameIds,
      layerIds: target.layerIds
    })))

    const result = stackSpriteSheetDocuments(parts, { document: 'stacked sheet', layer: 'sheet' })

    expect(result).toMatchObject({ itemCount: 2, sourceItemCount: 2 })
    expect(result.document).toMatchObject({ name: 'stacked sheet', width: 1, height: 2 })
    expect(Array.from(getActiveLayer(result.document).pixels)).toEqual([
      255, 0, 0, 255,
      0, 0, 255, 255
    ])
  })
})
