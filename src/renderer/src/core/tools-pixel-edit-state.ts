import { beginPixelEdit, type PixelEdit } from './history'

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
}

export interface SolidPointRecorder {
  packedValue: number
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

const brushTailParentByEdit = new WeakMap<PixelEdit, PixelEdit>()
const brushTailByParentEdit = new WeakMap<PixelEdit, PixelEdit>()

/** Call after reverting the previous tail, before painting either new segment. */
export const beginBrushTailEdit = (parent: PixelEdit): PixelEdit => {
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
