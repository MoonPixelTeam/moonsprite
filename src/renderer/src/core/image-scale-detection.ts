import type { SpriteDocument } from '@shared/types-document'
import { compositeRegion, DocumentCompositeCache } from './document-composite'

const DETECTION_CHUNK_ROWS = 64
const MAX_DETECTED_SCALE = 512

interface ScaleDetectionState {
  sawBoundary: boolean
  totalBoundaries: number
  horizontalBoundaries: Uint32Array
  verticalBoundaries: Uint32Array
  runVotes: Float64Array
  runEvidenceWeight: number
  verticalRunValues: Uint32Array
  verticalRunLengths: Uint32Array
  verticalLongestRuns: Uint32Array
  scannedRows: number
  verticalRunsFinalized: boolean
  previousRow: Uint32Array | null
  rowBuffer: Uint32Array
}

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b > 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a
}

const createDetectionState = (width: number, height: number): ScaleDetectionState => ({
  sawBoundary: false,
  totalBoundaries: 0,
  horizontalBoundaries: new Uint32Array(width),
  verticalBoundaries: new Uint32Array(height),
  runVotes: new Float64Array(MAX_DETECTED_SCALE + 1),
  runEvidenceWeight: 0,
  verticalRunValues: new Uint32Array(width),
  verticalRunLengths: new Uint32Array(width),
  verticalLongestRuns: new Uint32Array(width),
  scannedRows: 0,
  verticalRunsFinalized: false,
  previousRow: null,
  rowBuffer: new Uint32Array(width)
})

const recordRunEvidence = (state: ScaleDetectionState, length: number, direction: 1 | -1): void => {
  if (length < 1) return
  const weight = Math.min(length, 32) * direction
  state.runEvidenceWeight += weight
  if (length <= MAX_DETECTED_SCALE && length > 1) state.runVotes[length] += weight
  for (let divisor = 2; divisor * divisor <= length; divisor += 1) {
    if (length % divisor !== 0) continue
    if (divisor <= MAX_DETECTED_SCALE) state.runVotes[divisor] += weight
    const paired = length / divisor
    if (paired !== divisor && paired <= MAX_DETECTED_SCALE) state.runVotes[paired] += weight
  }
}

const finalizeVerticalRunEvidence = (state: ScaleDetectionState): void => {
  if (state.verticalRunsFinalized || state.scannedRows === 0) return
  for (let x = 0; x < state.verticalRunLengths.length; x += 1) {
    const length = state.verticalRunLengths[x]
    recordRunEvidence(state, length, 1)
    const longest = Math.max(state.verticalLongestRuns[x], length)
    recordRunEvidence(state, longest, -1)
  }
  state.verticalRunsFinalized = true
}

const scanRows = (
  rgba: Uint8ClampedArray,
  width: number,
  rowCount: number,
  startY: number,
  state: ScaleDetectionState
): void => {
  const words = rgba.byteOffset % 4 === 0
    ? new Uint32Array(rgba.buffer, rgba.byteOffset, Math.floor(rgba.byteLength / 4))
    : null

  for (let localY = 0; localY < rowCount; localY += 1) {
    const globalY = startY + localY
    const rowOffset = localY * width
    let leftValue = 0
    let horizontalRunLength = 0
    let horizontalLongestRun = 0

    for (let x = 0; x < width; x += 1) {
      const pixelIndex = rowOffset + x
      const byteOffset = pixelIndex * 4
      const value = rgba[byteOffset + 3] === 0
        ? 0
        : words
          ? words[pixelIndex]
          : (rgba[byteOffset] | (rgba[byteOffset + 1] << 8) | (rgba[byteOffset + 2] << 16) | (rgba[byteOffset + 3] << 24)) >>> 0
      state.rowBuffer[x] = value

      if (x > 0 && value !== leftValue) {
        recordRunEvidence(state, horizontalRunLength, 1)
        horizontalLongestRun = Math.max(horizontalLongestRun, horizontalRunLength)
        horizontalRunLength = 0
        state.sawBoundary = true
        state.totalBoundaries += 1
        state.horizontalBoundaries[x] += 1
      }
      if (state.previousRow && value !== state.previousRow[x]) {
        state.sawBoundary = true
        state.totalBoundaries += 1
        state.verticalBoundaries[globalY] += 1
      }
      if (state.scannedRows === 0) {
        state.verticalRunValues[x] = value
        state.verticalRunLengths[x] = 1
      } else if (value === state.verticalRunValues[x]) {
        state.verticalRunLengths[x] += 1
      } else {
        const verticalRunLength = state.verticalRunLengths[x]
        recordRunEvidence(state, verticalRunLength, 1)
        state.verticalLongestRuns[x] = Math.max(state.verticalLongestRuns[x], verticalRunLength)
        state.verticalRunValues[x] = value
        state.verticalRunLengths[x] = 1
      }
      horizontalRunLength += 1
      leftValue = value
    }

    recordRunEvidence(state, horizontalRunLength, 1)
    horizontalLongestRun = Math.max(horizontalLongestRun, horizontalRunLength)
    recordRunEvidence(state, horizontalLongestRun, -1)

    const completedRow = state.rowBuffer
    state.rowBuffer = state.previousRow ?? new Uint32Array(width)
    state.previousRow = completedRow
    state.scannedRows += 1
  }
}

const dominantFactor = (state: ScaleDetectionState, width: number, height: number): number | null => {
  if (!state.sawBoundary || state.totalBoundaries === 0) return null
  finalizeVerticalRunEvidence(state)

  let bestFactor: number | null = null
  let bestScore = 0
  const maxFactor = Math.min(MAX_DETECTED_SCALE, Math.max(width, height) - 1)
  for (let factor = 2; factor <= maxFactor; factor += 1) {
    const horizontalResidues = new Float64Array(factor)
    const verticalResidues = new Float64Array(factor)
    for (let x = 1; x < width; x += 1) {
      const count = state.horizontalBoundaries[x]
      if (count > 0) horizontalResidues[x % factor] += count
    }
    for (let y = 1; y < height; y += 1) {
      const count = state.verticalBoundaries[y]
      if (count > 0) verticalResidues[y % factor] += count
    }

    let horizontalPhase = 0
    let verticalPhase = 0
    for (let residue = 1; residue < factor; residue += 1) {
      if (horizontalResidues[residue] > horizontalResidues[horizontalPhase]) horizontalPhase = residue
      if (verticalResidues[residue] > verticalResidues[verticalPhase]) verticalPhase = residue
    }
    let horizontalCoordinates = 0
    let verticalCoordinates = 0
    for (let x = 1; x < width; x += 1) {
      if (state.horizontalBoundaries[x] > 0 && x % factor === horizontalPhase) horizontalCoordinates += 1
    }
    for (let y = 1; y < height; y += 1) {
      if (state.verticalBoundaries[y] > 0 && y % factor === verticalPhase) verticalCoordinates += 1
    }
    if (Math.max(horizontalCoordinates, verticalCoordinates) < 2) continue

    const alignedBoundaries = horizontalResidues[horizontalPhase] + verticalResidues[verticalPhase]
    const support = alignedBoundaries / state.totalBoundaries
    const randomSupport = 1 / factor
    const score = (support - randomSupport) / (1 - randomSupport)
    if (support < 0.8 || score < 0.7) continue
    if (score > bestScore + 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && factor > (bestFactor ?? 1))) {
      bestFactor = factor
      bestScore = score
    }
  }
  let runFactor: number | null = null
  if (state.runEvidenceWeight >= 24) {
    for (let factor = 2; factor <= MAX_DETECTED_SCALE; factor += 1) {
      const support = state.runVotes[factor] / state.runEvidenceWeight
      if (support >= 0.68) runFactor = factor
    }
  }
  if (runFactor && (!bestFactor || runFactor % bestFactor === 0)) return runFactor
  if (bestFactor) return bestFactor
  if (runFactor) return runFactor

  let exactFactor = greatestCommonDivisor(width, height)
  for (let x = 1; x < width && exactFactor > 1; x += 1) {
    if (state.horizontalBoundaries[x] > 0) exactFactor = greatestCommonDivisor(exactFactor, x)
  }
  for (let y = 1; y < height && exactFactor > 1; y += 1) {
    if (state.verticalBoundaries[y] > 0) exactFactor = greatestCommonDivisor(exactFactor, y)
  }
  return exactFactor > 1 ? exactFactor : null
}

/** Detects the largest exact integer pixel-block scale in an RGBA image. */
export function detectRepeatedPixelScale(rgba: Uint8ClampedArray, width: number, height: number): number | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null
  if (rgba.byteLength < width * height * 4) return null
  const state = createDetectionState(width, height)
  scanRows(rgba, width, height, 0, state)
  return dominantFactor(state, width, height)
}

/** Detects scale from the visible composite without allocating a full-canvas RGBA buffer. */
export function detectDocumentPixelScale(document: SpriteDocument): number | null {
  const { width, height } = document
  const state = createDetectionState(width, height)

  const cache = new DocumentCompositeCache()
  for (let startY = 0; startY < height; startY += DETECTION_CHUNK_ROWS) {
    const rowCount = Math.min(DETECTION_CHUNK_ROWS, height - startY)
    const rgba = compositeRegion(document, 0, startY, width, rowCount, cache)
    scanRows(rgba, width, rowCount, startY, state)
  }
  return dominantFactor(state, width, height)
}
