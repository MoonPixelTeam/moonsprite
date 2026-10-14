import { beginPixelEdit, type PixelEdit } from './history'
import type { SelectionMask } from '@shared/types-selection'

interface BrushCoverageChunks {
  chunks: Map<number, Uint16Array>
}

interface BrushStampState {
  key: string
  stampX: number
  stampY: number
  width: number
  height: number
  occupied: Uint8Array
  selection?: SelectionMask | null
}

export interface SolidPointRecorder {
  packedValue: number
  coverageKey?: string
  seen: Uint8Array
  indices: Uint32Array
  before: Uint32Array
  after: Uint32Array
  count: number
}

export const BRUSH_COVERAGE_CHUNK_BITS = 12

export const BRUSH_COVERAGE_CHUNK_SIZE = 1 << BRUSH_COVERAGE_CHUNK_BITS

export const BRUSH_COVERAGE_CHUNK_MASK = BRUSH_COVERAGE_CHUNK_SIZE - 1

export const brushCoverageByEdit = new WeakMap<PixelEdit, Map<string, BrushCoverageChunks>>()

export const brushPaintBaselineByEdit = new WeakMap<PixelEdit, Map<number, number>>()

export const lastBrushStampByEdit = new WeakMap<PixelEdit, BrushStampState>()

export const solidPointRecorderByEdit = new WeakMap<PixelEdit, SolidPointRecorder>()

/** Before switching inks/coverage, expose the compact stroke's original values
 * to the general path and avoid overlapping Map/point history records. */
export const materializeSolidBrushPoints = (edit: PixelEdit, packedValue: number | null, coverageKey?: string): void => {
  const recorder = solidPointRecorderByEdit.get(edit)
  if (!recorder || (recorder.packedValue === packedValue && recorder.coverageKey === coverageKey)) return
  for (let offset = 0; offset < recorder.count; offset++) {
    const index = recorder.indices[offset]
    if (!edit.before.has(index)) edit.before.set(index, recorder.before[offset])
    edit.after.set(index, recorder.after[offset])
    if (recorder.coverageKey) {
      let keys = brushCoverageByEdit.get(edit)
      if (!keys) { keys = new Map(); brushCoverageByEdit.set(edit, keys) }
      let record = keys.get(recorder.coverageKey)
      if (!record) { record = { chunks: new Map() }; keys.set(recorder.coverageKey, record) }
      const chunkIndex = index >> BRUSH_COVERAGE_CHUNK_BITS
      let chunk = record.chunks.get(chunkIndex)
      if (!chunk) { chunk = new Uint16Array(BRUSH_COVERAGE_CHUNK_SIZE); record.chunks.set(chunkIndex, chunk) }
      chunk[index & BRUSH_COVERAGE_CHUNK_MASK] = 256
    }
  }
  edit.points = undefined
  solidPointRecorderByEdit.delete(edit)
}

const brushTailParentByEdit = new WeakMap<PixelEdit, PixelEdit>()
const brushTailByParentEdit = new WeakMap<PixelEdit, PixelEdit>()

/** Call after reverting the previous tail, before painting either new segment. */
export const beginBrushTailEdit = (parent: PixelEdit): PixelEdit => {
  materializeSolidBrushPoints(parent, null)
  const tail = beginPixelEdit(parent.layerId)
  brushTailParentByEdit.set(tail, parent)
  brushTailByParentEdit.set(parent, tail)
  return tail
}

export const brushEditParent = (edit: PixelEdit): PixelEdit | undefined => brushTailParentByEdit.get(edit)

export const isSplitBrushEdit = (edit: PixelEdit): boolean => brushTailParentByEdit.has(edit) || brushTailByParentEdit.has(edit)

// The tail's undo baseline is the live prefix; its paint baseline is the start
// of the whole stroke. Keep those separate without copying the prefix per move.
export const brushOriginalValue = (edit: PixelEdit, index: number): number | undefined => {
  const parent = brushTailParentByEdit.get(edit)
  return brushPaintBaselineByEdit.get(edit)?.get(index)
    ?? (parent ? brushPaintBaselineByEdit.get(parent)?.get(index) ?? parent.before.get(index) : undefined)
    ?? edit.before.get(index)
}

export const lastBrushStampForEdit = (edit: PixelEdit): BrushStampState | undefined => {
  const parent = brushTailParentByEdit.get(edit)
  return lastBrushStampByEdit.get(edit) ?? (parent ? lastBrushStampByEdit.get(parent) : undefined)
}

export const relatedBrushEdit = (edit: PixelEdit): PixelEdit | undefined => brushTailParentByEdit.get(edit) ?? brushTailByParentEdit.get(edit)
