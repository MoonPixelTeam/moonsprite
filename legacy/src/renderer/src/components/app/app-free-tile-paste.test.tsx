import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/I18nProvider'
import { createDocument, writeLayerColor } from '@/core/document'
import { activeFreeTileCelTarget } from '@/core/free-tile-document'
import { loadShortcutBindings } from '@/core/shortcuts'
import { clipboardService } from '@/store/clipboard-service'
import { useWorkspace } from '@/store/workspace'
import { useAppCommandScope } from './useAppCommandScope'
import { useAppShortcutRouter } from './useAppShortcutRouter'

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null })
  clipboardService.clearLayer(); clipboardService.clearSelection(); clipboardService.clearAnimation()
  vi.stubGlobal('moonSprite', {
    readClipboardImage: vi.fn().mockResolvedValue(null),
    writeClipboardImage: vi.fn().mockResolvedValue(undefined),
    getResourceInfo: vi.fn().mockResolvedValue({ totalBytes: 8e9, freeBytes: 4e9 })
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['layers', 'tileset', 'canvas'])('Ctrl+A then Ctrl+C copies PNG pixels after opening from %s, and pastes into free tiles', async (initialScope) => {
  const destination = createDocument('A', 16, 16, 'rgba')
  useWorkspace.getState().addSession(destination)
  await useWorkspace.getState().createFreeTileLayer({ name: 'Free tiles' })
  useWorkspace.getState().setFreeTileMode('paint')
  const target = activeFreeTileCelTarget(destination)!
  const layerCount = destination.layers.length
  const sourceCount = target.layer.freeTileSources!.length
  const instanceCount = target.freeTiles.instances.length
  const hook = renderHook(() => {
    const scope = useAppCommandScope()
    useAppShortcutRouter({
      shortcuts: loadShortcutBindings(),
      homeOpen: false, outlineOpen: false, openMenu: false, shortcutOpen: false, timelineHidden: false,
      commandScope: () => scope.commandScopeRef.current,
      selectionOverride: () => scope.selectionCommandOverrideRef.current,
      pointerPosition: () => scope.pointerPositionRef.current,
      commandSurface: () => scope.commandSurfaceRef.current,
      rotationIndicatorPosition: 'canvas', onEscape: vi.fn(), commands: {}, openAdjustment: vi.fn(), publishShortcutCommand: vi.fn()
    })
    return scope
  }, { wrapper: I18nProvider })
  const previousPanel = document.createElement('div')
  previousPanel.dataset.commandScope = initialScope
  document.body.append(previousPanel)
  fireEvent.pointerDown(previousPanel)
  previousPanel.remove()
  const source = createDocument('B.png', 2, 2, 'rgba')
  for (let i = 0; i < 4; i++) writeLayerColor(source, source.layers[0], i, { r: 220, g: 30, b: 60, a: 255 })
  act(() => useWorkspace.getState().addSession(source))
  const press = (key: string) => act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, ctrlKey: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code: `Key${key.toUpperCase()}`, ctrlKey: true }))
  })
  press('a')
  press('c')
  expect(clipboardService.getLayers()).toBeNull()
  expect(clipboardService.getSelection()?.pixels).toEqual(new Uint32Array(4).fill(0xff3c1edc))
  expect(hook.result.current.commandScopeRef.current).toBe('canvas')
  act(() => useWorkspace.getState().setActive(destination.id))
  const paste = vi.spyOn(useWorkspace.getState(), 'pasteClipboard')
  press('v')
  await act(async () => { await paste.mock.results[0].value })
  expect(destination.layers).toHaveLength(layerCount)
  expect(target.layer.freeTileSources).toHaveLength(sourceCount + 1)
  expect(activeFreeTileCelTarget(destination)!.freeTiles.instances).toHaveLength(instanceCount + 1)
  const addedSource = target.layer.freeTileSources!.at(-1)!
  const tileset = destination.tilesets!.find((item) => item.id === addedSource.tilesetId)!
  expect(Array.from(tileset.pixels)).toEqual(Array.from(source.layers[0].pixels))
  act(() => useWorkspace.getState().undo())
  expect(activeFreeTileCelTarget(destination)!.freeTiles.instances).toHaveLength(instanceCount)
  expect(target.layer.freeTileSources).toHaveLength(sourceCount)
  act(() => useWorkspace.getState().redo())
  expect(activeFreeTileCelTarget(destination)!.freeTiles.instances).toHaveLength(instanceCount + 1)
  expect(destination.layers).toHaveLength(layerCount)
})
