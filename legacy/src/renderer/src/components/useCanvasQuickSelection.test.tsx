import { renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useCanvasQuickSelection } from './useCanvasQuickSelection'

it.each([100, 1500, 10000])('does not replace a completed unit drag with its final cell after %i ms', elapsed => {
  const localPointAt = vi.fn()
  const { result } = renderHook(() => useCanvasQuickSelection({
    inputRef: { current: { drag: null } },
    session: { tool: 'selection', selectionKind: 'rectangle' },
    localPointAt
  } as unknown as Parameters<typeof useCanvasQuickSelection>[0]))
  result.current.quickSelectionHandledAtRef.current = 100
  const preventDefault = vi.fn()
  result.current.quickSelectCell({ timeStamp: 100 + elapsed, preventDefault } as unknown as Parameters<typeof result.current.quickSelectCell>[0])
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(localPointAt).not.toHaveBeenCalled()
  expect(result.current.quickSelectionHandledAtRef.current).toBeNull()
})
