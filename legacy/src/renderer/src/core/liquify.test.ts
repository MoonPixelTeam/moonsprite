import { describe, expect, it } from 'vitest'
import type { LiquifyMode } from '@shared/types-brush'
import { createDocument, createLayerMask, readLayerColorAt, resizeDocumentAt, writeLayerColor } from './document'
import { beginPixelEdit, revertPixelEdit } from './history'
import { applyLiquifyPushPath, applyLiquifyStep, createLiquifyPushStroke, temporaryLiquifyModeForShift } from './liquify'

const createFixture = (size = 9) => {
  const document = createDocument('liquify', size, size, 'rgba')
  const layer = document.layers[0]
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    writeLayerColor(document, layer, y * size + x, { r: x * 17, g: y * 19, b: (x + y) * 11, a: 40 + x * 12 + y })
  }
  return { document, layer }
}

describe('liquify', () => {
  it('materializes a previously smaller layer to the resized canvas before deforming', () => {
    const document = createDocument('expanded liquify canvas', 32, 32, 'rgba')
    const layer = document.layers[0]
    resizeDocumentAt(document, 128, 128, 0, 0)

    // The target is outside the original 32×32 bitmap. A transparent dab
    // does not need to change pixels, but it must no longer be clipped by the
    // stale layer geometry.
    applyLiquifyStep(document, layer, beginPixelEdit(layer.id), { x: 96, y: 96 }, { x: 96, y: 96 }, {
      mode: 'inflate', radius: 8, strength: 100
    })

    expect(layer).toMatchObject({ width: 128, height: 128, offsetX: 0, offsetY: 0 })
  })

  it.each([
    { mode: 'push', expected: 'push' },
    { mode: 'inflate', expected: 'deflate' },
    { mode: 'deflate', expected: 'inflate' },
    { mode: 'twist-clockwise', expected: 'twist-counter-clockwise' },
    { mode: 'twist-counter-clockwise', expected: 'twist-clockwise' }
  ] satisfies Array<{ mode: LiquifyMode; expected: LiquifyMode }>)('temporarily reverses $mode while Shift is held', ({ mode, expected }) => {
    expect(temporaryLiquifyModeForShift(mode, true)).toBe(expected)
    expect(temporaryLiquifyModeForShift(mode, false)).toBe(mode)
  })

  it('pushes with inverse nearest-neighbor sampling and preserves the sampled alpha', () => {
    const { document, layer } = createFixture(17)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()
    const sampled = readLayerColorAt(document, layer, 7, 8)

    expect(applyLiquifyPushPath(document, layer, edit, stroke, { x: 7, y: 8 }, [{ x: 9, y: 8 }], { radius: 6, strength: 100 }).changed).toBe(true)
    expect(Array.from({ length: 5 }, (_, offset) => readLayerColorAt(document, layer, 8 + offset, 8))).toContainEqual(sampled)
    expect(edit.dirtyRect).toBeTruthy()
    expect(edit.dirtyRect!.width).toBeLessThanOrEqual(17)
    expect(edit.dirtyRect!.height).toBeLessThanOrEqual(17)
  })

  it('moves sparse content in the same vertical direction as the pointer', () => {
    const document = createDocument('vertical push', 17, 17, 'rgba')
    const layer = document.layers[0]
    const color = { r: 32, g: 96, b: 224, a: 255 }
    writeLayerColor(document, layer, 10 * layer.width + 8, color)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()

    applyLiquifyPushPath(document, layer, edit, stroke, { x: 8, y: 10 }, [{ x: 8, y: 8 }], { radius: 6, strength: 100 })

    expect(Array.from({ length: 3 }, (_, offset) => readLayerColorAt(document, layer, 8, 8 + offset))).toContainEqual(color)
    expect(readLayerColorAt(document, layer, 8, 10).a).toBe(0)
  })

  it.each([
    { name: 'left', delta: { x: -3, y: 0 } },
    { name: 'right', delta: { x: 3, y: 0 } },
    { name: 'up', delta: { x: 0, y: -3 } },
    { name: 'down', delta: { x: 0, y: 3 } }
  ])('moves the alpha centroid $name with the pointer', ({ delta }) => {
    const document = createDocument('directional push', 33, 33, 'rgba')
    const layer = document.layers[0]
    for (let y = 15; y <= 17; y += 1) for (let x = 15; x <= 17; x += 1) {
      writeLayerColor(document, layer, y * layer.width + x, { r: 64, g: 128, b: 240, a: 255 })
    }
    const alphaCentroid = () => {
      let total = 0
      let xTotal = 0
      let yTotal = 0
      for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
        const alpha = readLayerColorAt(document, layer, x, y).a
        total += alpha
        xTotal += x * alpha
        yTotal += y * alpha
      }
      return { x: xTotal / total, y: yTotal / total }
    }
    const before = alphaCentroid()

    applyLiquifyPushPath(
      document,
      layer,
      beginPixelEdit(layer.id),
      createLiquifyPushStroke(),
      { x: 16.75, y: 16.25 },
      [{ x: 16.75 + delta.x, y: 16.25 + delta.y }],
      { radius: 8, strength: 100 }
    )

    const after = alphaCentroid()
    if (delta.x !== 0) expect(Math.sign(after.x - before.x)).toBe(Math.sign(delta.x))
    if (delta.y !== 0) expect(Math.sign(after.y - before.y)).toBe(Math.sign(delta.y))
  })

  it('applies each push dab to a snapshot of the current local pixels', () => {
    const document = createDocument('local push', 33, 33, 'rgba')
    const layer = document.layers[0]
    const color = { r: 220, g: 84, b: 40, a: 255 }
    writeLayerColor(document, layer, 16 * layer.width + 10, color)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()

    applyLiquifyPushPath(document, layer, edit, stroke, { x: 10, y: 16 }, [{ x: 16, y: 16 }], { radius: 8, strength: 100 })
    expect(Array.from({ length: 9 }, (_, offset) => readLayerColorAt(document, layer, 11 + offset, 16))).toContainEqual(color)
    expect(readLayerColorAt(document, layer, 10, 16).a).toBe(0)
  })

  it('does not create a fixed diagonal bias when the push direction changes', () => {
    const { document, layer } = createFixture(33)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()
    const before = new Uint8ClampedArray(layer.pixels)
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 16, y: 16 }, [{ x: 22, y: 16 }], { radius: 8, strength: 100 })
    const afterRight = new Uint8ClampedArray(layer.pixels)
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 22, y: 16 }, [{ x: 16, y: 16 }], { radius: 8, strength: 100 })
    expect(layer.pixels).not.toEqual(before)
    expect(layer.pixels).not.toEqual(afterRight)
  })

  it('lets a long push reverse direction without retaining a fixed diagonal drift', () => {
    const document = createDocument('reverse push', 65, 65, 'rgba')
    const layer = document.layers[0]
    for (let y = 30; y <= 34; y += 1) for (let x = 30; x <= 34; x += 1) {
      writeLayerColor(document, layer, y * layer.width + x, { r: 220, g: 84, b: 40, a: 255 })
    }
    const alphaCentroid = () => {
      let total = 0
      let xTotal = 0
      let yTotal = 0
      for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
        const alpha = readLayerColorAt(document, layer, x, y).a
        total += alpha
        xTotal += x * alpha
        yTotal += y * alpha
      }
      return { x: xTotal / total, y: yTotal / total }
    }
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()
    const before = alphaCentroid()

    applyLiquifyPushPath(document, layer, edit, stroke, { x: 32, y: 32 }, [{ x: 52, y: 32 }], { radius: 10, strength: 100 })
    const afterRight = alphaCentroid()
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 52, y: 32 }, [{ x: 12, y: 32 }], { radius: 10, strength: 100 })
    const afterReverse = alphaCentroid()

    expect(afterRight.x).toBeGreaterThan(before.x)
    expect(afterReverse.x).toBeLessThan(afterRight.x)
    expect(Math.abs(afterReverse.y - before.y)).toBeLessThan(4)
  })

  it('tracks a diagonal drag instead of collapsing it to the bottom-right', () => {
    const document = createDocument('diagonal push', 65, 65, 'rgba')
    const layer = document.layers[0]
    for (let y = 30; y <= 34; y += 1) for (let x = 30; x <= 34; x += 1) {
      writeLayerColor(document, layer, y * layer.width + x, { r: 220, g: 84, b: 40, a: 255 })
    }
    const alphaCentroid = () => {
      let total = 0
      let xTotal = 0
      let yTotal = 0
      for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
        const alpha = readLayerColorAt(document, layer, x, y).a
        total += alpha
        xTotal += x * alpha
        yTotal += y * alpha
      }
      return { x: xTotal / total, y: yTotal / total }
    }
    const before = alphaCentroid()
    applyLiquifyPushPath(document, layer, beginPixelEdit(layer.id), createLiquifyPushStroke(), { x: 32, y: 32 }, [{ x: 52, y: 12 }], { radius: 10, strength: 100 })
    const after = alphaCentroid()

    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeLessThan(before.y)
  })

  it('keeps horizontal pixel-art rows contiguous while pushing', () => {
    const document = createDocument('coherent horizontal push', 33, 17, 'rgba')
    const layer = document.layers[0]
    const color = { r: 240, g: 180, b: 64, a: 255 }
    for (let y = 5; y <= 11; y += 1) for (let x = 8; x <= 10; x += 1) writeLayerColor(document, layer, y * layer.width + x, color)
    applyLiquifyPushPath(document, layer, beginPixelEdit(layer.id), createLiquifyPushStroke(), { x: 8, y: 8 }, [{ x: 15, y: 8 }], { radius: 6, strength: 100 })
    for (let y = 5; y <= 11; y += 1) {
      const occupied = []
      for (let x = 0; x < layer.width; x += 1) if (readLayerColorAt(document, layer, x, y).a > 0) occupied.push(x)
      if (occupied.length < 2) continue
      for (let x = occupied[0]; x <= occupied.at(-1)!; x += 1) expect(readLayerColorAt(document, layer, x, y).a).toBeGreaterThan(0)
    }
  })

  it('upgrades an initially axial gesture to diagonal when the path bends', () => {
    const document = createDocument('diagonal upgrade', 41, 41, 'rgba')
    const layer = document.layers[0]
    const color = { r: 96, g: 220, b: 128, a: 255 }
    writeLayerColor(document, layer, 20 * layer.width + 12, color)
    const stroke = createLiquifyPushStroke()
    const edit = beginPixelEdit(layer.id)
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 12, y: 20 }, [{ x: 16, y: 20 }], { radius: 8, strength: 100 })
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 16, y: 20 }, [{ x: 20, y: 16 }], { radius: 8, strength: 100 })
    expect(stroke.axisMode).toBe('diagonal')
    expect([...layer.pixels].some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
  })

  it('keeps a shallow diagonal bend after an axial segment', () => {
    const document = createDocument('shallow diagonal upgrade', 41, 41, 'rgba')
    const layer = document.layers[0]
    writeLayerColor(document, layer, 20 * layer.width + 12, { r: 96, g: 220, b: 128, a: 255 })
    const stroke = createLiquifyPushStroke()
    const edit = beginPixelEdit(layer.id)
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 12, y: 20 }, [{ x: 16, y: 20 }], { radius: 8, strength: 100 })
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 16, y: 20 }, [{ x: 20, y: 19 }], { radius: 8, strength: 100 })
    expect(stroke.axisMode).toBe('diagonal')
    expect([...layer.pixels].some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
  })

  it('reports repeated writes inside the same edited region as changed', () => {
    const { document, layer } = createFixture(9)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()

    const first = applyLiquifyPushPath(document, layer, edit, stroke, { x: 4, y: 4 }, [{ x: 5, y: 4 }], { radius: 20, strength: 100 })
    const editSizeAfterFirstPush = edit.before.size + edit.after.size
    const pixelsAfterFirstPush = new Uint8ClampedArray(layer.pixels)
    const second = applyLiquifyPushPath(document, layer, edit, stroke, { x: 5, y: 4 }, [{ x: 4, y: 4 }], { radius: 20, strength: 100 })

    expect(first.changed).toBe(true)
    expect(edit.before.size + edit.after.size).toBe(editSizeAfterFirstPush)
    expect(layer.pixels).not.toEqual(pixelsAfterFirstPush)
    expect(second.changed).toBe(true)
    expect(second.dirtyRect).toEqual({ x: 0, y: 0, width: 9, height: 9 })
  })

  it('uses a strong center and a rapidly fading outer falloff', () => {
    const document = createDocument('radial push falloff', 17, 17, 'rgba')
    const layer = document.layers[0]
    for (let y = 0; y < layer.height; y += 1) for (let x = 0; x < layer.width; x += 1) {
      writeLayerColor(document, layer, y * layer.width + x, { r: x * 10, g: 0, b: 0, a: 255 })
    }

    applyLiquifyPushPath(document, layer, beginPixelEdit(layer.id), createLiquifyPushStroke(), { x: 8, y: 8 }, [{ x: 12, y: 8 }], { radius: 8, strength: 100 })

    expect(readLayerColorAt(document, layer, 12, 8).r).toBeLessThan(120)
    expect(readLayerColorAt(document, layer, 5, 8).r).toBeLessThanOrEqual(50)
  })

  it('interpolates a fast path at fixed brush spacing', () => {
    const { document, layer } = createFixture(129)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()
    const result = applyLiquifyPushPath(document, layer, edit, stroke, { x: 8, y: 64 }, [{ x: 120, y: 64 }], { radius: 8, strength: 100 })

    expect(result.dabCount).toBe(112)
    expect(stroke.dabCount).toBeGreaterThan(0)
  })

  it.each<LiquifyMode>(['inflate', 'deflate', 'twist-clockwise', 'twist-counter-clockwise'])('applies %s locally', (mode) => {
    const { document, layer } = createFixture()
    const edit = beginPixelEdit(layer.id)
    expect(applyLiquifyStep(document, layer, edit, { x: 4, y: 4 }, { x: 4, y: 4 }, { mode, radius: 4, strength: 100 })).toBe(true)
    expect(edit.before.size).toBeGreaterThan(0)
    expect(edit.before.size).toBeLessThan(document.width * document.height)
  })

  it.each<LiquifyMode>(['inflate', 'deflate', 'twist-clockwise', 'twist-counter-clockwise'])('re-renders held %s deformation from the gesture baseline', (mode) => {
    const gradual = createFixture(17)
    const direct = createFixture(17)
    const gradualEdit = beginPixelEdit(gradual.layer.id)
    const directEdit = beginPixelEdit(direct.layer.id)
    const center = { x: 8, y: 8 }

    applyLiquifyStep(gradual.document, gradual.layer, gradualEdit, center, center, { mode, radius: 6, strength: 25 })
    applyLiquifyStep(gradual.document, gradual.layer, gradualEdit, center, center, { mode, radius: 6, strength: 50 })
    applyLiquifyStep(direct.document, direct.layer, directEdit, center, center, { mode, radius: 6, strength: 50 })

    expect(gradual.layer.pixels).toEqual(direct.layer.pixels)
  })

  it.each<LiquifyMode>(['twist-clockwise', 'twist-counter-clockwise'])('clears stale sparse pixels while held %s strength increases', (mode) => {
    const gradual = createDocument('gradual sparse twist', 17, 17, 'rgba')
    const direct = createDocument('direct sparse twist', 17, 17, 'rgba')
    const gradualLayer = gradual.layers[0]
    const directLayer = direct.layers[0]
    for (let y = 7; y <= 9; y += 1) for (let x = 10; x <= 12; x += 1) {
      const color = { r: 24 + x * 9, g: 48 + y * 11, b: 196, a: 255 }
      writeLayerColor(gradual, gradualLayer, y * gradualLayer.width + x, color)
      writeLayerColor(direct, directLayer, y * directLayer.width + x, color)
    }
    const gradualEdit = beginPixelEdit(gradualLayer.id)
    const directEdit = beginPixelEdit(directLayer.id)
    const center = { x: 8, y: 8 }

    applyLiquifyStep(gradual, gradualLayer, gradualEdit, center, center, { mode, radius: 6, strength: 35 })
    applyLiquifyStep(gradual, gradualLayer, gradualEdit, center, center, { mode, radius: 6, strength: 80 })
    applyLiquifyStep(direct, directLayer, directEdit, center, center, { mode, radius: 6, strength: 80 })

    expect(gradualLayer.pixels).toEqual(directLayer.pixels)
  })

  it('restricts destination pixels with both selection and layer mask', () => {
    const { document, layer } = createFixture()
    const mask = createLayerMask(layer.id, document.width, document.height, 'cel')
    for (let offset = 0; offset < mask.pixels.length; offset += 4) mask.pixels[offset + 3] = 255
    writeLayerColor(document, mask, 4 * mask.width + 4, { r: 255, g: 255, b: 255, a: 255 })
    const edit = beginPixelEdit(layer.id)
    const untouched = readLayerColorAt(document, layer, 5, 4)

    expect(applyLiquifyStep(document, layer, edit, { x: 2, y: 4 }, { x: 4, y: 4 }, {
      mode: 'push', radius: 3, strength: 100, selection: { x: 4, y: 4, width: 2, height: 1 }, mask
    })).toBe(true)
    expect(readLayerColorAt(document, layer, 5, 4)).toEqual(untouched)
    expect([...edit.before.keys()]).toEqual([4 * layer.width + 4])
  })

  it('reverts the complete multi-step gesture through one pixel edit', () => {
    const { document, layer } = createFixture()
    const before = new Uint8ClampedArray(layer.pixels)
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 2, y: 3 }, [{ x: 4, y: 3 }], { radius: 3, strength: 100 })
    applyLiquifyPushPath(document, layer, edit, stroke, { x: 4, y: 3 }, [{ x: 5, y: 4 }], { radius: 3, strength: 70 })
    expect(layer.pixels).not.toEqual(before)

    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })
})
