import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createDocument, writeLayerColor } from '@/core/document-model'
import { compositeRegion } from '@/core/document-composite'
import { DEFAULT_SPRITE_SHEET_IMPORT as defaults } from '@/core/sprite-sheet-import'
import { useWorkspace } from './workspace'

beforeEach(() => {
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
  vi.stubGlobal('moonSprite', { getResourceInfo: vi.fn().mockResolvedValue({ freeBytes: 2 ** 40 }) })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('imports in place as one undo step and restores canvas, layers, palette, selection and animation', async () => {
  const source = createDocument('sheet', 4, 2, 'rgba', false)
  writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
  writeLayerColor(source, source.layers[0], 2, { r: 0, g: 0, b: 255, a: 255 })
  useWorkspace.getState().addSession(source)
  const session = useWorkspace.getState().sessions[0]
  session.selection = { x: 1, y: 0, width: 2, height: 1 }
  const layerId = source.layers[0].id, before = compositeRegion(source, 0, 0, 4, 2)
  expect(await useWorkspace.getState().importSpriteSheet(source.id, { ...defaults, width: 2, height: 2 })).toBe(true)
  expect(useWorkspace.getState().sessions).toHaveLength(1)
  expect(source.width).toBe(2); expect(source.animation!.frames).toHaveLength(2)
  expect(session.history.position).toBe(1); expect(session.selection).toBeNull()
  useWorkspace.getState().undo()
  expect(source.width).toBe(4); expect(source.layers[0].id).toBe(layerId); expect(source.animation!.frames).toHaveLength(1)
  expect(session.selection).toMatchObject({ x: 1, width: 2 })
  expect(compositeRegion(source, 0, 0, 4, 2)).toEqual(before)
  useWorkspace.getState().redo()
  expect(source.width).toBe(2); expect(source.animation!.frames).toHaveLength(2)
  useWorkspace.getState().undo()
  expect(compositeRegion(source, 0, 0, 4, 2)).toEqual(before)
})
it('rejects empty slices and resource failures without changing history or pixels', async () => {
  const source = createDocument('sheet', 4, 2, 'rgba', false); useWorkspace.getState().addSession(source)
  const session = useWorkspace.getState().sessions[0]
  expect(await useWorkspace.getState().importSpriteSheet(source.id, defaults)).toBe(false)
  vi.mocked(window.moonSprite.getResourceInfo).mockResolvedValue({ freeBytes: 1 } as Awaited<ReturnType<typeof window.moonSprite.getResourceInfo>>)
  expect(await useWorkspace.getState().importSpriteSheet(source.id, { ...defaults, width: 2, height: 2 })).toBe(false)
  expect(source.width).toBe(4); expect(session.history.position).toBe(0)
})
it('does not apply a pending import to a changed or closed document', async () => {
  const source = createDocument('sheet', 4, 2, 'rgba', false); useWorkspace.getState().addSession(source)
  let resolve!: (value: Awaited<ReturnType<typeof window.moonSprite.getResourceInfo>>) => void
  vi.mocked(window.moonSprite.getResourceInfo).mockReturnValue(new Promise(done => { resolve = done }))
  const pending = useWorkspace.getState().importSpriteSheet(source.id, { ...defaults, width: 2, height: 2 })
  useWorkspace.getState().sessions[0].contentRevision++
  resolve({ freeBytes: 2 ** 40 } as Awaited<ReturnType<typeof window.moonSprite.getResourceInfo>>)
  expect(await pending).toBe(false); expect(source.width).toBe(4)
  expect(useWorkspace.getState().sessions[0].history.position).toBe(0)
})
