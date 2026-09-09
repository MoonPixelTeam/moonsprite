import { expect, it } from 'vitest'
import { createResizeDiagnostics } from './workspace-resize-diagnostics'

it('aggregates a long resize without retaining per-frame samples or exceeding the diagnostic key limit', () => {
  const diagnostics = createResizeDiagnostics()
  diagnostics.context({ width: 4000, height: 4000, layers: 30, zoom: 0.25 })
  for (let i = 0; i < 10000; i++) diagnostics.record('main', i % 2 ? 4 : 20)
  for (const stage of ['layout', 'backing', 'composite', 'preview', 'observer', 'inputWait', 'settle'] as const) diagnostics.record(stage, 2)
  diagnostics.record('main', NaN)
  const detail = diagnostics.snapshot()
  expect(detail.mainCount).toBe(10000)
  expect(detail.mainMeanMs).toBe(12)
  expect(detail.mainMaxMs).toBe(20)
  expect(detail.layers).toBe(30)
  expect(Object.keys(detail).length).toBeLessThanOrEqual(32)
  diagnostics.record('main', 100)
  expect(detail.mainMaxMs).toBe(20)
})
