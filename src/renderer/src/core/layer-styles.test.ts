import { describe, expect, it } from 'vitest'
import { compositeRegion, createDocument, createLayer, createLayerMask, DocumentCompositeCache, getActiveLayer, normalCompositeLayers, writeLayerColor } from './document'
import { ensureAnimationDocument } from './animation'
import { applyLayerStylesAt, applySimpleLayerStylesPacked, createDefaultLayerStyles, hasConfiguredLayerStyles, hasEnabledLayerStyles, normalizeLayerStyles } from './layer-styles'
import { packColor, TRANSPARENT, unpackColor } from './raster'

const red = { r: 255, g: 0, b: 0, a: 255 }
const blue = { r: 0, g: 0, b: 255, a: 255 }
const pixelAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => {
  const offset = (y * width + x) * 4
  return Array.from(pixels.subarray(offset, offset + 4))
}

describe('non-destructive layer styles', () => {
  it('normalizes persisted parameters into bounded complete settings', () => {
    expect(normalizeLayerStyles({
      stroke: { enabled: true, color: { r: -10, g: 20, b: 999, a: 300 }, size: 99, position: 'invalid' },
      shadow: { enabled: true, offsetX: -999, offsetY: 999, blur: -5 }
    })).toMatchObject({
      enabled: true,
      stroke: { enabled: true, color: { r: 0, g: 20, b: 255, a: 255 }, size: 64, position: 'outside', kernel: 'round', directions: { nw: false, n: true, ne: false, w: true, e: true, sw: false, s: true, se: false }, smartHue: false, smartHueDarkness: 45 },
      shadow: { enabled: true, offsetX: -64, offsetY: 64, blur: 0, smartShadow: false, smartShadowDarkness: 45 },
      innerGlow: { enabled: false },
      colorOverlay: { enabled: false },
      gradientOverlay: { enabled: false, dither: 'none' }
    })
  })

  it('preserves configured effects while the global style switch suppresses rendering', () => {
    const document = createDocument('disabled stroke', 3, 1, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 1, red)
    const styles = createDefaultLayerStyles()
    styles.enabled = false
    styles.stroke = { ...styles.stroke, enabled: true, color: blue, size: 1, position: 'outside' }
    layer.layerStyles = styles

    expect(hasConfiguredLayerStyles(styles)).toBe(true)
    expect(hasEnabledLayerStyles(styles)).toBe(false)
    expect(normalCompositeLayers(document)).not.toBeNull()
    expect(Array.from(compositeRegion(document, 0, 0, 3, 1))).toEqual([
      0, 0, 0, 0,
      255, 0, 0, 255,
      0, 0, 0, 0
    ])
    expect(layer.layerStyles.stroke).toMatchObject({ enabled: true, size: 1, color: blue })
  })

  it('renders an outside stroke and disables the normal-layer fast path', () => {
    const document = createDocument('stroke', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 2 * 5 + 2, red)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, color: blue, size: 1, position: 'outside' }
    layer.layerStyles = styles

    const output = compositeRegion(document, 0, 0, 5, 5)
    expect(normalCompositeLayers(document)).toBeNull()
    expect(pixelAt(output, 5, 2, 2)).toEqual([255, 0, 0, 255])
    expect(pixelAt(output, 5, 1, 2)).toEqual([0, 0, 255, 255])
    expect(pixelAt(output, 5, 1, 1)).toEqual([0, 0, 0, 0])
  })





  it('applies styles to the composited contents of a layer group', () => {
    const document = createDocument('group stroke', 5, 5, 'rgba')
    const layer = getActiveLayer(document)
    layer.groupId = 'group'
    writeLayerColor(document, layer, 2 * 5 + 2, red)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, color: blue, size: 1, position: 'outside' }
    document.groups.push({ id: 'group', name: 'Group', parentGroupId: null, visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles: styles })

    const output = compositeRegion(document, 0, 0, 5, 5)
    expect(normalCompositeLayers(document)).toBeNull()
    expect(pixelAt(output, 5, 2, 2)).toEqual([255, 0, 0, 255])
    expect(pixelAt(output, 5, 1, 2)).toEqual([0, 0, 255, 255])
  })





  it('applies color and gradient overlays while preserving source alpha', () => {
    const colorDocument = createDocument('color overlay', 1, 1, 'rgba')
    const colorLayer = getActiveLayer(colorDocument)
    writeLayerColor(colorDocument, colorLayer, 0, { ...red, a: 128 })
    const colorStyles = createDefaultLayerStyles()
    colorStyles.colorOverlay = { enabled: true, color: { r: 0, g: 255, b: 0, a: 255 } }
    colorLayer.layerStyles = colorStyles
    expect(Array.from(compositeRegion(colorDocument, 0, 0, 1, 1))).toEqual([0, 255, 0, 128])

    const gradientDocument = createDocument('gradient overlay', 3, 1, 'rgba')
    const gradientLayer = getActiveLayer(gradientDocument)
    for (let index = 0; index < 3; index += 1) writeLayerColor(gradientDocument, gradientLayer, index, red)
    const gradientStyles = createDefaultLayerStyles()
    gradientStyles.gradientOverlay = {
      enabled: true,
      from: { r: 0, g: 0, b: 0, a: 255 },
      to: { r: 255, g: 255, b: 255, a: 255 },
      angle: 0,
      dither: 'none'
    }
    gradientLayer.layerStyles = gradientStyles
    const output = compositeRegion(gradientDocument, 0, 0, 3, 1)
    expect(pixelAt(output, 3, 0, 0)).toEqual([0, 0, 0, 255])
    expect(pixelAt(output, 3, 1, 0)).toEqual([128, 128, 128, 255])
    expect(pixelAt(output, 3, 2, 0)).toEqual([255, 255, 255, 255])
  })

  it('updates a cached styled layer locally without changing the complete result', () => {
    const document = createDocument('incremental layer style', 12, 12, 'rgba')
    const layer = getActiveLayer(document)
    for (let y = 2; y < 10; y += 1) for (let x = 2; x < 10; x += 1) writeLayerColor(document, layer, y * layer.width + x, red)
    const styles = createDefaultLayerStyles()
    styles.innerGlow = { enabled: true, color: { r: 255, g: 255, b: 255, a: 255 }, size: 2 }
    layer.layerStyles = styles
    const cache = new DocumentCompositeCache()
    compositeRegion(document, 0, 0, document.width, document.height, cache, 1)

    writeLayerColor(document, layer, 5 * layer.width + 5, { r: 0, g: 255, b: 0, a: 255 })
    const cachedResult = compositeRegion(
      document,
      0,
      0,
      document.width,
      document.height,
      cache,
      2,
      { x: 1, y: 1, width: 10, height: 10 },
      { x: 5, y: 5, width: 1, height: 1 }
    )
    const completeResult = compositeRegion(document, 0, 0, document.width, document.height)
    expect(Array.from(cachedResult)).toEqual(Array.from(completeResult))
  })

  it('updates offset styled layers locally without changing the complete result', () => {
    const document = createDocument('offset incremental layer style', 16, 16, 'rgba')
    const layer = getActiveLayer(document)
    layer.offsetX = 3
    layer.offsetY = 2
    for (let y = 2; y < 10; y += 1) for (let x = 2; x < 10; x += 1) writeLayerColor(document, layer, y * layer.width + x, red)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, color: blue, size: 2, position: 'both' }
    styles.shadow = { ...styles.shadow, enabled: true, offsetX: 1, offsetY: -1, blur: 2 }
    layer.layerStyles = styles
    const cache = new DocumentCompositeCache()
    compositeRegion(document, 0, 0, document.width, document.height, cache, 1)

    writeLayerColor(document, layer, 5 * layer.width + 5, { r: 0, g: 255, b: 0, a: 255 })
    const cachedResult = compositeRegion(
      document,
      0,
      0,
      document.width,
      document.height,
      cache,
      2,
      { x: 3, y: 2, width: 12, height: 12 },
      { x: 8, y: 7, width: 1, height: 1 }
    )
    const completeResult = compositeRegion(document, 0, 0, document.width, document.height)
    expect(Array.from(cachedResult)).toEqual(Array.from(completeResult))
  })

  it('does not reuse a stale distance field after a topology edit', () => {
    const document = createDocument('topology then color', 24, 24, 'rgba')
    const layer = getActiveLayer(document)
    for (let y = 5; y < 19; y += 1) for (let x = 5; x < 19; x += 1) writeLayerColor(document, layer, y * layer.width + x, red)
    const styles = createDefaultLayerStyles()
    styles.innerGlow = { ...styles.innerGlow, enabled: true, color: { r: 255, g: 255, b: 255, a: 255 }, size: 3 }
    layer.layerStyles = styles
    const cache = new DocumentCompositeCache()
    compositeRegion(document, 0, 0, document.width, document.height, cache, 1)

    const hole = { x: 10, y: 10, width: 1, height: 1 }
    writeLayerColor(document, layer, 10 * layer.width + 10, TRANSPARENT)
    compositeRegion(document, 0, 0, document.width, document.height, cache, 2, { x: 7, y: 7, width: 7, height: 7 }, hole)

    const colorEdit = { x: 12, y: 10, width: 1, height: 1 }
    writeLayerColor(document, layer, 10 * layer.width + 12, { r: 0, g: 255, b: 0, a: 255 })
    const cachedResult = compositeRegion(document, 0, 0, document.width, document.height, cache, 3, { x: 9, y: 7, width: 7, height: 7 }, colorEdit)
    const completeResult = compositeRegion(document, 0, 0, document.width, document.height)
    expect(Array.from(cachedResult)).toEqual(Array.from(completeResult))
  })

  it('grows and retains the cached styled bounds without a full layer scan', () => {
    const document = createDocument('growing incremental layer style', 24, 24, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 12 * layer.width + 12, red)
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled: true, color: blue, size: 2, position: 'outside' }
    styles.shadow = { ...styles.shadow, enabled: true, offsetX: 1, offsetY: -1, blur: 2 }
    styles.innerGlow = { ...styles.innerGlow, enabled: true, size: 2 }
    layer.layerStyles = styles
    const cache = new DocumentCompositeCache()
    compositeRegion(document, 0, 0, document.width, document.height, cache, 1)

    writeLayerColor(document, layer, 4 * layer.width + 4, red)
    const expandedResult = compositeRegion(
      document,
      0,
      0,
      document.width,
      document.height,
      cache,
      2,
      { x: 2, y: 2, width: 5, height: 5 },
      { x: 4, y: 4, width: 1, height: 1 }
    )
    expect(Array.from(expandedResult)).toEqual(Array.from(compositeRegion(document, 0, 0, document.width, document.height)))

    writeLayerColor(document, layer, 12 * layer.width + 12, TRANSPARENT)
    const erasedResult = compositeRegion(
      document,
      0,
      0,
      document.width,
      document.height,
      cache,
      3,
      { x: 10, y: 10, width: 5, height: 5 },
      { x: 12, y: 12, width: 1, height: 1 }
    )
    expect(Array.from(erasedResult)).toEqual(Array.from(compositeRegion(document, 0, 0, document.width, document.height)))
  })

  it('refreshes visible tiles after an in-place styled bitmap update', () => {
    const document = createDocument('styled tile refresh', 1100, 1000, 'rgba')
    const layer = getActiveLayer(document)
    writeLayerColor(document, layer, 0, red)
    writeLayerColor(document, layer, (document.height - 1) * document.width + document.width - 1, red)
    const styles = createDefaultLayerStyles()
    styles.innerGlow = { ...styles.innerGlow, enabled: true, size: 2 }
    layer.layerStyles = styles
    const cache = new DocumentCompositeCache()
    compositeRegion(document, 0, 0, document.width, document.height, cache, 1)

    const centerX = Math.floor(document.width / 2)
    const centerY = Math.floor(document.height / 2)
    writeLayerColor(document, layer, centerY * document.width + centerX, red)
    const dirty = { x: centerX - 2, y: centerY - 2, width: 5, height: 5 }
    const cachedResult = compositeRegion(document, dirty.x, dirty.y, dirty.width, dirty.height, cache, 2, dirty, { x: centerX, y: centerY, width: 1, height: 1 })
    const completeResult = compositeRegion(document, dirty.x, dirty.y, dirty.width, dirty.height)
    expect(Array.from(cachedResult)).toEqual(Array.from(completeResult))
    expect(pixelAt(cachedResult, dirty.width, 2, 2)[3]).toBeGreaterThan(0)
  })

  it('keeps incrementally updated row spans identical to a full scan', () => {
    const document = createDocument('incremental row spans', 37, 11, 'rgba')
    const layer = getActiveLayer(document)
    for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
      if ((x * 17 + y * 13) % 7 < 3) writeLayerColor(document, layer, y * layer.width + x, red)
    }
    const cache = new DocumentCompositeCache()
    cache.rowsFor(layer, document.palette, 1)
    const edits = [
      { x: 0, y: 1, width: 4, height: 3 },
      { x: 8, y: 2, width: 11, height: 2 },
      { x: 30, y: 5, width: 7, height: 4 },
      { x: 15, y: 8, width: 3, height: 3 }
    ]
    for (const dirty of edits) {
      for (let y = dirty.y; y < dirty.y + dirty.height; y += 1) for (let x = dirty.x; x < dirty.x + dirty.width; x += 1) {
        const value = (x + y * 3) % 4 === 0 ? red : TRANSPARENT
        writeLayerColor(document, layer, y * layer.width + x, value)
      }
      const incremental = cache.rowsFor(layer, document.palette, 2, dirty)
      const complete = new DocumentCompositeCache().rowsFor(layer, document.palette, 2)
      expect(Array.from(incremental)).toEqual(Array.from(complete))
    }
  })

  it('keeps the packed shadow and inner-glow path equivalent to the full evaluator', () => {
    const geometry = { x: 0, y: 0, width: 5, height: 5 }
    const cases = [
      { source: { r: 220, g: 40, b: 80, a: 255 }, shadow: 0.5, innerGlow: 0.25 },
      { source: { r: 220, g: 40, b: 80, a: 128 }, shadow: 0.75, innerGlow: 0.4 },
      { source: { r: 0, g: 0, b: 0, a: 0 }, shadow: 0, innerGlow: 0 },
      { source: { r: 0, g: 0, b: 0, a: 0 }, shadow: 0.8, innerGlow: 0 }
    ]
    for (const testCase of cases) {
      const read = (x: number, y: number) => x === 2 && y === 2 ? testCase.source : { r: 0, g: 0, b: 0, a: 0 }
      const styles = createDefaultLayerStyles()
      styles.shadow = { ...styles.shadow, enabled: true, color: { r: 12, g: 24, b: 48, a: 160 }, blur: 2 }
      styles.innerGlow = { ...styles.innerGlow, enabled: true, color: { r: 255, g: 255, b: 255, a: 192 }, size: 2 }
      const fallbackStyles = {
        ...styles,
        colorOverlay: { ...styles.colorOverlay, enabled: true, color: { r: 0, g: 0, b: 0, a: 0 } }
      }
      const expected = applyLayerStylesAt(
        geometry,
        fallbackStyles,
        2,
        2,
        testCase.source,
        read,
        (color) => color,
        { shadow: testCase.shadow, innerGlow: testCase.innerGlow }
      )
      const actualPacked = applySimpleLayerStylesPacked(
        styles,
        2,
        2,
        packColor(testCase.source),
        read,
        testCase.shadow,
        testCase.innerGlow
      )
      expect(actualPacked).not.toBeNull()
      expect(unpackColor(actualPacked!)).toEqual(expected)
    }
  })

  it('keeps binary stroke distance fields equivalent to the precise evaluator', () => {
    const createStyledDocument = (styles: ReturnType<typeof createDefaultLayerStyles>, name: string) => {
      const document = createDocument(name, 15, 15, 'rgba')
      const layer = getActiveLayer(document)
      for (let y = 4; y < 11; y += 1) for (let x = 3; x < 12; x += 1) {
        if (x === 3 || x === 11 || y === 4 || y === 10 || (x === 7 && y >= 6 && y <= 8)) {
          writeLayerColor(document, layer, y * layer.width + x, red)
        }
      }
      layer.layerStyles = styles
      return document
    }

    const strokeCases = [
      { kernel: 'square' as const, directions: { nw: true, n: true, ne: true, w: true, e: true, sw: true, s: true, se: true } },
      { kernel: 'horizontal' as const, directions: { nw: false, n: false, ne: false, w: true, e: true, sw: false, s: false, se: false } },
      { kernel: 'vertical' as const, directions: { nw: false, n: true, ne: false, w: false, e: false, sw: false, s: true, se: false } },
      { kernel: 'round' as const, directions: { nw: false, n: true, ne: false, w: true, e: true, sw: false, s: true, se: false } }
    ]
    for (const position of ['inside', 'outside', 'both'] as const) for (const strokeCase of strokeCases) {
      const optimizedStyles = createDefaultLayerStyles()
      optimizedStyles.stroke = {
        ...optimizedStyles.stroke,
        enabled: true,
        color: blue,
        size: 2,
        position,
        kernel: strokeCase.kernel,
        directions: strokeCase.directions
      }
      optimizedStyles.shadow = { ...optimizedStyles.shadow, enabled: true, offsetX: 1, offsetY: -1, blur: 1 }
      optimizedStyles.innerGlow = { ...optimizedStyles.innerGlow, enabled: true, size: 2 }

      const preciseStyles = {
        ...optimizedStyles,
        colorOverlay: { ...optimizedStyles.colorOverlay, enabled: true, color: { r: 0, g: 0, b: 0, a: 0 } }
      }
      const optimized = createStyledDocument(optimizedStyles, `optimized ${position} ${strokeCase.kernel}`)
      const precise = createStyledDocument(preciseStyles, `precise ${position} ${strokeCase.kernel}`)
      const optimizedOutput = compositeRegion(optimized, 0, 0, optimized.width, optimized.height, new DocumentCompositeCache(), 1)
      const preciseOutput = compositeRegion(precise, 0, 0, precise.width, precise.height, new DocumentCompositeCache(), 1)
      expect(Array.from(optimizedOutput), `${position}/${strokeCase.kernel}`).toEqual(Array.from(preciseOutput))
    }
  })

  it('keeps the packed alpha path equivalent for partially transparent contents', () => {
    const createStyledDocument = (styles: ReturnType<typeof createDefaultLayerStyles>, name: string) => {
      const document = createDocument(name, 9, 7, 'rgba')
      const layer = getActiveLayer(document)
      for (let y = 1; y < 6; y += 1) for (let x = 1; x < 8; x += 1) {
        const alpha = (x * 37 + y * 53) % 256
        writeLayerColor(document, layer, y * layer.width + x, { r: 220, g: 40, b: 80, a: alpha })
      }
      layer.layerStyles = styles
      return document
    }
    const optimizedStyles = createDefaultLayerStyles()
    optimizedStyles.shadow = { ...optimizedStyles.shadow, enabled: true, color: { r: 12, g: 24, b: 48, a: 160 }, offsetX: 1, offsetY: -1, blur: 2 }
    optimizedStyles.innerGlow = { ...optimizedStyles.innerGlow, enabled: true, color: { r: 255, g: 255, b: 255, a: 192 }, size: 2 }
    const preciseStyles = {
      ...optimizedStyles,
      colorOverlay: { ...optimizedStyles.colorOverlay, enabled: true, color: { r: 0, g: 0, b: 0, a: 0 } }
    }
    const optimized = createStyledDocument(optimizedStyles, 'packed alpha')
    const precise = createStyledDocument(preciseStyles, 'precise alpha')
    const optimizedOutput = compositeRegion(optimized, 0, 0, optimized.width, optimized.height, new DocumentCompositeCache(), 1)
    const preciseOutput = compositeRegion(precise, 0, 0, precise.width, precise.height, new DocumentCompositeCache(), 1)
    expect(Array.from(optimizedOutput)).toEqual(Array.from(preciseOutput))
  })

})
