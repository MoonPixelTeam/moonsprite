import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { MoonSpriteApi } from '@shared/types-platform'
import { createDocument, readLayerColorAt, writeLayerColor } from '@/core/document'
import { encodeProject, PROJECT_SCHEMA_VERSION } from '@/core/project-format'
import { HistoryStack } from '@/core/history'
import { useWorkspace } from './workspace'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null })
})
afterEach(() => vi.restoreAllMocks())

it.each([16, PROJECT_SCHEMA_VERSION])('opens a saved v%s project into an editable session', async (version) => {
  const source = createDocument('saved project', 8, 6, 'rgba')
  writeLayerColor(source, source.layers[0], 2 * source.width + 1, { r: 41, g: 121, b: 255, a: 255 })
  const files = unzipSync(encodeProject(source))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  manifest.schemaVersion = version
  manifest.document.schemaVersion = version
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  const readBinary = vi.fn(async () => zipSync(files))
  Object.defineProperty(window, 'moonSprite', {
    configurable: true, writable: true, value: { readBinary } as unknown as MoonSpriteApi
  })

  const opened = await useWorkspace.getState().openPath('D:/gallery/saved.moonsprite')

  expect(opened, useWorkspace.getState().message ?? '').toBe(true)
  expect(readBinary).toHaveBeenCalledTimes(1)
  const session = useWorkspace.getState().sessions[0]
  expect(useWorkspace.getState().activeId).toBe(session.document.id)
  expect(session.document.dirty).toBe(false)
  expect(readLayerColorAt(session.document, session.document.layers[0], 1, 2)).toEqual({ r: 41, g: 121, b: 255, a: 255 })
  expect(session.history.entryLimit).toBe(Infinity)
  expect(session.history.canUndo).toBe(false)
})

it.each([[NaN, 1000], [Infinity, Infinity], [0, 1], [2.6, 3], [20000, 10000]])(
  'normalizes history limit %s during construction and settings updates', (value, expected) => {
    const history = new HistoryStack(undefined, value)
    expect(history.entryLimit).toBe(expected)
    history.setMaxEntries(10)
    history.setMaxEntries(value)
    expect(history.entryLimit).toBe(expected)
  }
)
