import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document'
import { beginPixelEdit } from '@/core/history'
import { applyLiquifyPushPath, applyLiquifyHoldStep, createLiquifyPushStroke } from '@/core/liquify'
import { useWorkspace } from '@/store/workspace'
import { accumulateLiquifyHoldStrength, applyAccumulatedLiquifyPush, createLiquifyHoldClock, LIQUIFY_HOLD_STEP_MS } from './canvas-liquify-interaction'

const createFixture = () => {
  const document = createDocument('liquify interaction', 9, 9, 'rgba')
  const layer = document.layers[0]
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) {
    writeLayerColor(document, layer, y * 9 + x, { r: x * 17, g: y * 19, b: (x + y) * 11, a: 40 + x * 12 + y })
  }
  return { document, layer }
}

const createFrameDriver = () => {
  let now = 0
  let nextId = 1
  const frames = new Map<number, FrameRequestCallback>()
  return {
    now: () => now,
    requestFrame(callback: FrameRequestCallback) {
      const id = nextId
      nextId += 1
      frames.set(id, callback)
      return id
    },
    cancelFrame(id: number) { frames.delete(id) },
    advance(ms = LIQUIFY_HOLD_STEP_MS) {
      now += ms
      const pending = [...frames.values()]
      frames.clear()
      for (const callback of pending) callback(now)
    },
    get pendingFrames() { return frames.size }
  }
}

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
})

describe('CanvasStage liquify interactions', () => {
  it('ends the resettable liquify run when another tool is selected', () => {
    const { document } = createFixture()
    useWorkspace.getState().addSession(document)
    useWorkspace.getState().setTool('liquify')
    useWorkspace.getState().setLiquifyResetHistoryPosition(0, 0)

    useWorkspace.getState().setTool('pencil')

    const session = useWorkspace.getState().sessions[0]!
    expect(session.liquifyResetHistoryPosition).toBeNull()
    expect(session.liquifyResetHistoryRevision).toBeNull()
  })

  it('builds stationary strength gradually instead of jumping to full deformation', () => {
    let accumulated = 0
    for (let step = 0; step < 4; step += 1) accumulated = accumulateLiquifyHoldStrength(accumulated, 50)
    expect(accumulated).toBe(20)
  })

  it('accumulates small pointer movement for push and never pushes without movement', () => {
    const { document, layer } = createFixture()
    const edit = beginPixelEdit(layer.id)
    const before = new Uint8ClampedArray(layer.pixels)
    const start = { x: 2, y: 4 }
    const stroke = createLiquifyPushStroke()
    let applications = 0
    const apply = (from: typeof start, path: readonly typeof start[]) => {
      applications += 1
      return applyLiquifyPushPath(document, layer, edit, stroke, from, path, { radius: 3, strength: 100 }).changed
    }

    const stationary = applyAccumulatedLiquifyPush(start, [], apply)
    expect(stationary.changed).toBe(false)
    expect(applications).toBe(0)

    const result = applyAccumulatedLiquifyPush(start, [
      { x: 2.2, y: 4 },
      { x: 2.45, y: 4 },
      { x: 3.2, y: 4 }
    ], apply)

    expect(result.changed).toBe(true)
    expect(applications).toBe(1)
    expect(result.samplePoint).toEqual({ x: 3.2, y: 4 })
    expect(layer.pixels).not.toEqual(before)
  })

  it('accumulates sub-pixel movement in the field without replaying a segment', () => {
    const start = { x: 2, y: 4 }
    const { document, layer } = createFixture()
    const edit = beginPixelEdit(layer.id)
    const stroke = createLiquifyPushStroke()
    const apply = (from: typeof start, path: readonly typeof start[]) =>
      applyLiquifyPushPath(document, layer, edit, stroke, from, path, { radius: 3, strength: 100 }).changed
    const first = applyAccumulatedLiquifyPush(start, [{ x: 2.3, y: 4 }], apply)
    const second = applyAccumulatedLiquifyPush(first.samplePoint, [{ x: 2.4, y: 4 }, { x: 2.7, y: 4 }], apply)

    expect(first.samplePoint).toEqual({ x: 2.3, y: 4 })
    expect(second.samplePoint).toEqual({ x: 2.7, y: 4 })
    expect(stroke.dabCount).toBeGreaterThan(0)
  })

  it('ticks a stationary hold until pointer-up and commits the whole hold once', () => {
    const { document, layer } = createFixture()
    const before = new Uint8ClampedArray(layer.pixels)
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]!
    const edit = beginPixelEdit(layer.id)
    const center = { x: 4, y: 4 }
    const driver = createFrameDriver()
    let holding = true
    let steps = 0
    const clock = createLiquifyHoldClock({
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      now: driver.now,
      shouldRun: () => holding,
      onStep: () => {
        steps += 1
        applyLiquifyHoldStep(document, layer, edit, center, { mode: 'inflate', radius: 4, strength: accumulateLiquifyHoldStrength(0, 80) })
      }
    })

    clock.start()
    for (let frame = 0; frame < 10; frame += 1) driver.advance()
    expect(steps).toBe(10)
    expect(layer.pixels).not.toEqual(before)

    holding = false
    clock.stop()
    const pixelsAtPointerUp = Array.from(layer.pixels)
    driver.advance(LIQUIFY_HOLD_STEP_MS * 4)
    expect(steps).toBe(10)
    expect(Array.from(layer.pixels)).toEqual(pixelsAtPointerUp)
    expect(driver.pendingFrames).toBe(0)

    useWorkspace.getState().commitLiquifyStroke(edit, 'Liquify', false)
    expect(session.history.position).toBe(1)
    useWorkspace.getState().undo()
    expect(layer.pixels).toEqual(before)
  })

  it('stops the hold clock and restores pixels when the gesture is cancelled', () => {
    const { document, layer } = createFixture()
    const before = new Uint8ClampedArray(layer.pixels)
    useWorkspace.getState().addSession(document)
    const edit = beginPixelEdit(layer.id)
    const center = { x: 4, y: 4 }
    const driver = createFrameDriver()
    const clock = createLiquifyHoldClock({
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      now: driver.now,
      shouldRun: () => true,
      onStep: () => { applyLiquifyHoldStep(document, layer, edit, center, { mode: 'twist-clockwise', radius: 4, strength: 100 }) }
    })

    clock.start()
    driver.advance()
    expect(layer.pixels).not.toEqual(before)
    clock.stop()
    useWorkspace.getState().cancelLiquifyStroke(edit, false)

    driver.advance()
    expect(layer.pixels).toEqual(before)
    expect(useWorkspace.getState().sessions[0]!.history.position).toBe(0)
    expect(driver.pendingFrames).toBe(0)
  })
})
