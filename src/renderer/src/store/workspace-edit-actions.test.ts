import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDocument, createLayer, writeLayerColor, readLayerColorAt } from '@/core/document'
import { useWorkspace } from './workspace'
import { clipboardService } from './clipboard-service'
import { invertWorkspaceColors, rotateWorkspaceContent } from './workspace-edit-actions'

beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }); vi.stubGlobal('moonSprite', { writeClipboardImage: vi.fn(async () => {}) }) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); useWorkspace.setState({ sessions: [], activeId: null }) })

it.each([90, -90, 180] as const)('rotates selected pixels by %s without leaving a copy and supports undo', angle => {
  const document = createDocument('rotate', 3, 3, 'rgba', false)
  const layer = document.layers[0]
  writeLayerColor(document, layer, 0, { r: 255, g: 0, b: 0, a: 255 })
  useWorkspace.getState().addSession(document)
  useWorkspace.getState().setSelection({ x: 0, y: 0, width: 3, height: 3 })
  rotateWorkspaceContent(angle)
  const [x, y] = angle === 90 ? [2, 0] : angle === -90 ? [0, 2] : [2, 2]
  expect(readLayerColorAt(document, layer, x, y)).toEqual({ r: 255, g: 0, b: 0, a: 255 })
  expect(readLayerColorAt(document, layer, 0, 0).a).toBe(0)
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, layer, 0, 0).r).toBe(255)
  useWorkspace.getState().redo()
  expect(readLayerColorAt(document, layer, x, y).r).toBe(255)
})

it('inverts RGB while preserving alpha and can undo', () => {
  const document = createDocument('invert', 1, 1, 'rgba', false)
  const layer = document.layers[0]
  const before = { r: 20, g: 60, b: 100, a: 128 }
  writeLayerColor(document, layer, 0, before)
  useWorkspace.getState().addSession(document)
  invertWorkspaceColors()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual({ r: 235, g: 195, b: 155, a: 128 })
  useWorkspace.getState().undo()
  expect(readLayerColorAt(document, layer, 0, 0)).toEqual(before)
})

it('copies merged visible layers to the clipboard without a selection or document edit', () => {
  const document = createDocument('merged', 2, 1, 'rgba', false)
  const lower = document.layers[0]
  const upper = createLayer('upper', 2, 1, 'rgba')
  document.layers.push(upper)
  writeLayerColor(document, lower, 0, { r: 255, g: 0, b: 0, a: 255 })
  writeLayerColor(document, upper, 1, { r: 0, g: 255, b: 0, a: 255 })
  useWorkspace.getState().addSession(document)
  const session = useWorkspace.getState().sessions[0]
  const revision = session.contentRevision
  useWorkspace.getState().copySelection(true)
  const clipboard = clipboardService.getSelection()!
  expect(clipboard.width).toBe(2)
  expect(clipboard.pixels[0]).not.toBe(0)
  expect(clipboard.pixels[1]).not.toBe(0)
  expect(session.contentRevision).toBe(revision)
  expect(session.selection).toBeNull()
  expect(window.moonSprite.writeClipboardImage).toHaveBeenCalledOnce()
})
