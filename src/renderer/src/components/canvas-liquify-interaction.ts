export const LIQUIFY_HOLD_STEP_MS = 50
const LIQUIFY_MAX_CATCH_UP_STEPS = 4
const LIQUIFY_STRENGTH_WINDOW_MS = 500

export interface LiquifyHoldClock {
  start(): void
  stop(): void
  isRunning(): boolean
}

export interface LiquifyHoldClockOptions {
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(frameId: number): void
  now(): number
  shouldRun(): boolean
  onStep(): void
  stepMs?: number
}

/** Fixed-timestep RAF clock used for stationary liquify gestures. */
export function createLiquifyHoldClock(options: LiquifyHoldClockOptions): LiquifyHoldClock {
  const stepMs = Math.max(1, options.stepMs ?? LIQUIFY_HOLD_STEP_MS)
  let frameId: number | null = null
  let nextStepAt: number | null = null

  const frame = (now: number): void => {
    frameId = null
    if (!options.shouldRun()) {
      nextStepAt = null
      return
    }
    if (nextStepAt === null) nextStepAt = now
    let steps = 0
    while (now >= nextStepAt && steps < LIQUIFY_MAX_CATCH_UP_STEPS) {
      options.onStep()
      nextStepAt += stepMs
      steps += 1
    }
    if (steps === LIQUIFY_MAX_CATCH_UP_STEPS && now >= nextStepAt) nextStepAt = now + stepMs
    frameId = options.requestFrame(frame)
  }

  return {
    start() {
      if (frameId !== null) return
      nextStepAt = options.now() + stepMs
      frameId = options.requestFrame(frame)
    },
    stop() {
      if (frameId !== null) options.cancelFrame(frameId)
      frameId = null
      nextStepAt = null
    },
    isRunning: () => frameId !== null
  }
}

export function applyAccumulatedLiquifyPush<Point>(
  samplePoint: Point,
  pointerSamples: readonly Point[],
  apply: (from: Point, path: readonly Point[]) => boolean
): { samplePoint: Point; pointerPoint: Point; changed: boolean } {
  const pointerPoint = pointerSamples.at(-1) ?? samplePoint
  // The core batches all coalesced samples into one displacement-field render,
  // preserving curved paths without repeating a full radius warp per sample.
  const changed = pointerSamples.length > 0 && apply(samplePoint, pointerSamples)
  return { samplePoint: pointerSamples.length > 0 ? pointerPoint : samplePoint, pointerPoint, changed }
}

/** Accumulates weak hold input until nearest-neighbor sampling can cross a pixel boundary. */
export function accumulateLiquifyHoldStrength(pending: number, configuredStrength: number, stepMs = LIQUIFY_HOLD_STEP_MS): number {
  const impulse = Math.max(0.1, Math.max(0, configuredStrength) * stepMs / LIQUIFY_STRENGTH_WINDOW_MS)
  return Math.min(100, pending + impulse)
}
