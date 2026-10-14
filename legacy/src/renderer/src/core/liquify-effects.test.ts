import { describe, expect, it } from 'vitest'
import { PIXEL_FORMATS } from './pixel-format'
import { createDocument, createLayerMask, readLayerColorAt, readLayerPacked, writeLayerColor } from './document'
import { beginPixelEdit, revertPixelEdit } from './history'
import { applyLiquifyHoldStep, applyLiquifyHoldPath, applyLiquifyPushPath, applyLiquifyStep, createLiquifyPushStroke, resetLiquifyStroke, sampleLiquifyPixel } from './liquify'

const fixture = (size = 64) => {
  const document = createDocument('liquify effects', size, size, 'rgba', false)
  const layer = document.layers[0]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    writeLayerColor(document, layer, y * size + x, { r: x % 256, g: y % 256, b: (x + y) % 256, a: 255 })
  }
  return { document, layer, edit: beginPixelEdit(layer.id), stroke: createLiquifyPushStroke() }
}
const modes = ['inflate', 'deflate', 'twist-clockwise', 'twist-counter-clockwise'] as const

describe('liquify effect continuity', () => {
  it.each(modes)('keeps %s buildup through tiny pointer jitter', mode => {
    const a = fixture(), b = fixture()
    for (let i = 0; i < 20; i++) {
      applyLiquifyHoldStep(a.document, a.layer, a.edit, { x: 32, y: 32 }, { mode, radius: 16, strength: 5 })
      applyLiquifyHoldStep(b.document, b.layer, b.edit, { x: 32 + (i ? 0.01 : 0), y: 32 }, { mode, radius: 16, strength: 5 })
    }
    expect(b.layer.pixels).toEqual(a.layer.pixels)
    const held = b.layer.pixels.slice()
    for (let i = 0; i < 20; i++) applyLiquifyHoldStep(b.document, b.layer, b.edit, { x: 32.01, y: 32 }, { mode, radius: 16, strength: 5 })
    expect(b.layer.pixels).not.toEqual(held)
  })

  it.each(modes)('continues %s from the current shape at a new center and undoes once', mode => {
    const f = fixture(), reference = fixture()
    const original = f.layer.pixels.slice()
    applyLiquifyHoldStep(f.document, f.layer, f.edit, { x: 32, y: 32 }, { mode, radius: 16, strength: 100 })
    reference.layer.pixels.set(f.layer.pixels)
    const next = { x: 33, y: 32 }
    applyLiquifyHoldStep(f.document, f.layer, f.edit, next, { mode, radius: 16, strength: 5 })
    applyLiquifyStep(reference.document, reference.layer, reference.edit, next, next, { mode, radius: 16, strength: 5 })
    expect(f.layer.pixels).toEqual(reference.layer.pixels)
    revertPixelEdit(f.document, f.edit)
    expect(f.layer.pixels).toEqual(original)
  })

  it('reverses the hold mode from the current shape without jumping to the opposite baseline warp', () => {
    const f = fixture(), reference = fixture(), center = { x: 32, y: 32 }
    applyLiquifyHoldStep(f.document, f.layer, f.edit, center, { mode: 'twist-clockwise', radius: 16, strength: 75 })
    reference.layer.pixels.set(f.layer.pixels)
    applyLiquifyHoldStep(f.document, f.layer, f.edit, center, { mode: 'twist-counter-clockwise', radius: 16, strength: 5 })
    applyLiquifyStep(reference.document, reference.layer, reference.edit, center, center, { mode: 'twist-counter-clockwise', radius: 16, strength: 5 })
    expect(f.layer.pixels).toEqual(reference.layer.pixels)
  })

  it.each([2, 7, 100])('produces the same shallow push with %i dispatched segments', divisions => {
    const a = fixture(), b = fixture(), start = { x: 20, y: 20 }, end = { x: 40, y: 24 }
    const options = { radius: 16, strength: 100 }
    applyLiquifyPushPath(a.document, a.layer, a.edit, a.stroke, start, [end], options)
    let previous = start
    for (let i = 1; i <= divisions; i++) {
      const next = { x: 20 + 20 * i / divisions, y: 20 + 4 * i / divisions }
      applyLiquifyPushPath(b.document, b.layer, b.edit, b.stroke, previous, [next], options)
      previous = next
    }
    expect(b.stroke.axisMode).toBe('diagonal')
    expect(b.layer.pixels).toEqual(a.layer.pixels)
    const reference = fixture()
    revertPixelEdit(b.document, b.edit)
    expect(b.layer.pixels).toEqual(reference.layer.pixels)
  })

  it('keeps curved paths and reversals identical across event batches', () => {
    const a = fixture(), b = fixture(), start = { x: 20, y: 20 }
    const points = [{ x: 28.3, y: 20 }, { x: 35.5, y: 24 }, { x: 21.2, y: 30 }, { x: 20, y: 20 }]
    const options = { radius: 12, strength: 70 }
    applyLiquifyPushPath(a.document, a.layer, a.edit, a.stroke, start, points, options)
    let from = start
    for (const point of points) {
      applyLiquifyPushPath(b.document, b.layer, b.edit, b.stroke, from, [point], options)
      from = point
    }
    expect(b.layer.pixels).toEqual(a.layer.pixels)
  })

  it('does not truncate long small-brush paths at an event boundary', () => {
    const a = fixture(160), b = fixture(160), start = { x: 5, y: 80 }, end = { x: 155, y: 80 }
    applyLiquifyPushPath(a.document, a.layer, a.edit, a.stroke, start, [end], { radius: 2, strength: 100 })
    for (let x = 6; x <= 155; x++) applyLiquifyPushPath(b.document, b.layer, b.edit, b.stroke, { x: x - 1, y: 80 }, [{ x, y: 80 }], { radius: 2, strength: 100 })
    expect(a.layer.pixels).toEqual(b.layer.pixels)
  })

  it.each(['horizontal', 'vertical'] as const)('confines fractional %s pushes to the circular brush', axis => {
    const f = fixture()
    const start = { x: 30.25, y: 30.25 }
    const end = axis === 'horizontal' ? { x: 32.25, y: 30.25 } : { x: 30.25, y: 32.25 }
    applyLiquifyPushPath(f.document, f.layer, f.edit, f.stroke, start, [end], { radius: 6, strength: 100 })
    expect(f.edit.before.size).toBeGreaterThan(0)
    for (const i of f.edit.before.keys()) {
      const x = i % 64, y = Math.floor(i / 64)
      expect([1, 2].some(step => Math.hypot(x - (start.x + (axis === 'horizontal' ? step : 0)), y - (start.y + (axis === 'vertical' ? step : 0))) <= 6)).toBe(true)
    }
  })

  it('clears path previews and held source when resetting the transaction', () => {
    const f = fixture(), original = f.layer.pixels.slice()
    applyLiquifyPushPath(f.document, f.layer, f.edit, f.stroke, { x: 30, y: 30 }, [{ x: 31.3, y: 30.4 }], { radius: 6, strength: 100 })
    resetLiquifyStroke(f.document, f.edit, f.stroke)
    expect(f.layer.pixels).toEqual(original)
    expect(f.stroke.provisional).toBeUndefined()
    expect(f.stroke.path).toBeUndefined()
  })
})

describe('categorical pixel-art sampling', () => {
  const readPattern = (rows: string[]) => (x: number, y: number) => x < 0 || y < 0 || x >= rows[0].length || y >= rows.length ? undefined : Number(rows[y][x])
  it('refines supported corners using an existing neighbor color only', () => {
    const read = readPattern(['110', '100', '000'])
    expect(sampleLiquifyPixel(read, 0.6, 0.6)).toBe(1)
    expect(sampleLiquifyPixel(read, 1, 1)).toBe(0)
  })
  it.each([['000', '010', '000'], ['111', '101', '111'], ['010', '010', '010'], ['000', '111', '000']])('preserves isolated pixels, holes and one-pixel strokes: %s', (...rows: string[]) => {
    const read = readPattern(rows)
    for (const dx of [-0.4, 0.4]) for (const dy of [-0.4, 0.4]) expect(sampleLiquifyPixel(read, 1 + dx, 1 + dy)).toBe(read(1, 1))
  })
  it.each(modes)('keeps all %s output colors and alpha in the source palette', mode => {
    const f = fixture()
    const source = new Set(Array.from({ length: 4096 }, (_, i) => readLayerPacked(f.document, f.layer, i)))
    applyLiquifyStep(f.document, f.layer, f.edit, { x: 32, y: 32 }, { x: 32, y: 32 }, { mode, radius: 20, strength: 80 })
    for (let i = 0; i < 4096; i++) expect(source.has(readLayerPacked(f.document, f.layer, i))).toBe(true)
  })
})

const countComponents = (occupied: Set<number>, width: number): number => {
  const pending = new Set(occupied)
  let components = 0
  while (pending.size) {
    const start = pending.values().next().value!
    pending.delete(start)
    const stack = [start]
    components++
    while (stack.length) {
      const i = stack.pop()!
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = i % width + dx, y = Math.floor(i / width) + dy, next = y * width + x
        if (x >= 0 && x < width && y >= 0 && pending.delete(next)) stack.push(next)
      }
    }
  }
  return components
}

describe('thin source structure through the complete warp', () => {
  it.each(modes)('keeps a one-pixel curve connected during %s and preserves alpha', mode => {
    const document = createDocument('thin curve', 32, 32, 'rgba', false), layer = document.layers[0]
    for (let x = 5; x <= 26; x++) {
      const y = Math.round(16 + 4 * Math.sin(x / 4))
      writeLayerColor(document, layer, y * 32 + x, { r: 60, g: 160, b: 255, a: x < 16 ? 128 : 255 })
    }
    const colors = new Set(Array.from({ length: 1024 }, (_, i) => readLayerPacked(document, layer, i)))
    const before = layer.pixels.slice(), edit = beginPixelEdit(layer.id), center = { x: 16, y: 16 }
    applyLiquifyStep(document, layer, edit, center, center, { mode, radius: 14, strength: 75 })
    const occupied = new Set<number>()
    for (let i = 0; i < 1024; i++) {
      const packed = readLayerPacked(document, layer, i)
      expect(colors.has(packed)).toBe(true)
      if (packed >>> 24) occupied.add(i)
    }
    expect(countComponents(occupied, 32)).toBe(1)
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })

  it.each(modes)('preserves an indexed ring and its transparent center during %s', mode => {
    const document = createDocument('indexed ring', 32, 32, 'indexed', false), layer = document.layers[0]
    for (let y = 8; y <= 24; y++) for (let x = 8; x <= 24; x++) {
      if (Math.max(Math.abs(x - 16), Math.abs(y - 16)) === 8) writeLayerColor(document, layer, y * 32 + x, { r: 255, g: 255, b: 255, a: 255 })
    }
    const ids = new Set(layer.pixels), before = layer.pixels.slice(), edit = beginPixelEdit(layer.id), center = { x: 16, y: 16 }
    applyLiquifyStep(document, layer, edit, center, center, { mode, radius: 14, strength: 75 })
    expect(readLayerColorAt(document, layer, 16, 16).a).toBe(0)
    const occupied = new Set<number>()
    for (let i = 0; i < 1024; i++) {
      expect(ids.has(layer.pixels[i])).toBe(true)
      if (readLayerColorAt(document, layer, i % 32, Math.floor(i / 32)).a) occupied.add(i)
    }
    expect(countComponents(occupied, 32)).toBe(1)
    revertPixelEdit(document, edit)
    expect(layer.pixels).toEqual(before)
  })

  it('does not connect independent dots when preserving thin features', () => {
    const document = createDocument('dots', 32, 32, 'rgba', false), layer = document.layers[0]
    for (const x of [10, 22]) writeLayerColor(document, layer, 16 * 32 + x, { r: 255, g: 255, b: 255, a: 255 })
    const center = { x: 16, y: 16 }
    applyLiquifyStep(document, layer, beginPixelEdit(layer.id), center, center, { mode: 'twist-clockwise', radius: 14, strength: 75 })
    const occupied = new Set<number>()
    for (let i = 0; i < 1024; i++) if (readLayerPacked(document, layer, i) >>> 24) occupied.add(i)
    expect(countComponents(occupied, 32)).toBe(2)
  })

  it('clips connectivity writes to the selection and protection mask', () => {
    const document = createDocument('protected curve', 32, 32, 'rgba', false), layer = document.layers[0]
    for (let x = 5; x <= 26; x++) writeLayerColor(document, layer, Math.round(16 + 4 * Math.sin(x / 4)) * 32 + x, { r: 255, g: 255, b: 255, a: 255 })
    const mask = createLayerMask(layer.id, 32, 32)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) writeLayerColor(document, mask, y * 32 + x, { r: x < 16 ? 255 : 0, g: 0, b: 0, a: 255 })
    const edit = beginPixelEdit(layer.id), center = { x: 16, y: 16 }
    applyLiquifyStep(document, layer, edit, center, center, { mode: 'twist-clockwise', radius: 14, strength: 75, selection: { x: 8, y: 8, width: 16, height: 16 }, mask })
    expect(edit.before.size).toBeGreaterThan(0)
    for (const i of edit.before.keys()) {
      expect(i % 32).toBeGreaterThanOrEqual(8)
      expect(i % 32).toBeLessThan(16)
      expect(Math.floor(i / 32)).toBeGreaterThanOrEqual(8)
      expect(Math.floor(i / 32)).toBeLessThan(24)
    }
  })
})


describe('sustained and moving liquify', () => {
  it.each(modes)('continues %s beyond several seconds and restores the entire gesture', mode => {
    const f = fixture(), original = f.layer.pixels.slice()
    const options = { mode, radius: 16, strength: 5 }
    let previous = original
    // 20 impulses per second: verify every second, including after the old cap.
    for (let second = 0; second < 4; second++) {
      for (let tick = 0; tick < 20; tick++) applyLiquifyHoldStep(f.document, f.layer, f.edit, { x: 32, y: 32 }, options)
      expect(f.layer.pixels).not.toEqual(previous)
      previous = f.layer.pixels.slice()
    }
    revertPixelEdit(f.document, f.edit)
    expect(f.layer.pixels).toEqual(original)
  })

  it.each(['inflate', 'deflate'] as const)('applies weak moving %s without waiting for a stationary tick', mode => {
    const f = fixture(), original = f.layer.pixels.slice()
    const result = applyLiquifyHoldPath(f.document, f.layer, f.edit, { x: 8, y: 32 }, { x: 56, y: 32 }, { mode, radius: 16, strength: 5 })
    expect(result.changed).toBe(true)
    expect(result.dabCount).toBe(24)
    expect(result.dirtyRect).not.toBeNull()
    expect(f.layer.pixels).not.toEqual(original)
    revertPixelEdit(f.document, f.edit)
    expect(f.layer.pixels).toEqual(original)
  })

  it.each(modes)('keeps the moving %s result independent of event frequency', mode => {
    const a = fixture(), b = fixture(), options = { mode, radius: 12, strength: 45 }
    const start = { x: 8, y: 28 }, end = { x: 56, y: 36 }
    applyLiquifyHoldPath(a.document, a.layer, a.edit, start, end, options)
    let from = start
    for (let i = 1; i <= 100; i++) {
      const to = { x: 8 + 48 * i / 100, y: 28 + 8 * i / 100 }
      applyLiquifyHoldPath(b.document, b.layer, b.edit, from, to, options)
      from = to
    }
    expect(b.layer.pixels).toEqual(a.layer.pixels)
  })
})


describe('liquify on transparent layers', () => {
  it.each(PIXEL_FORMATS)('preserves empty pixels and source colors in %s during deformation and undo', format => {
    for (const mode of ['push', ...modes] as const) {
      const document = createDocument('transparent cyan ring', 32, 32, 'rgba', false, format)
      const layer = document.layers[0]
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const distance = Math.hypot(x - 16, y - 16)
        if (distance > 5 && distance < 9) writeLayerColor(document, layer, y * 32 + x, { r: 164, g: 228, b: 252, a: 255 })
      }
      const original = layer.pixels.slice()
      const colors = new Set(Array.from({ length: 1024 }, (_, i) => readLayerPacked(document, layer, i)))
      const edit = beginPixelEdit(layer.id)
      if (mode === 'push') {
        applyLiquifyPushPath(document, layer, edit, createLiquifyPushStroke(), { x: 12, y: 16 }, [{ x: 18, y: 17 }], { radius: 12, strength: 75 })
      } else {
        for (let tick = 0; tick < 30; tick++) applyLiquifyHoldStep(document, layer, edit, { x: 16, y: 16 }, { mode, radius: 12, strength: 10 })
        applyLiquifyHoldPath(document, layer, edit, { x: 16, y: 16 }, { x: 21, y: 18 }, { mode, radius: 12, strength: 50 })
      }
      const output = new Set(Array.from({ length: 1024 }, (_, i) => readLayerPacked(document, layer, i)))
      expect([...output].filter(color => !colors.has(color)), mode).toEqual([])
      expect(output.has(0), mode).toBe(true)
      revertPixelEdit(document, edit)
      expect(layer.pixels, mode).toEqual(original)
    }
  })
})
