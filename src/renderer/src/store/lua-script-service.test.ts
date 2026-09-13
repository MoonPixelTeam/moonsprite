import { beforeEach, describe, expect, it } from 'vitest'
import type { LuaScriptExecutionContext, LuaScriptRunResult } from '@shared/types-scripting'
import { createDocument, getActiveLayer, readLayerPacked } from '@/core/document'
import { animationLayerAtFrame, ensureAnimationDocument } from '@/core/animation'
import { createDefaultLayerStyles } from '@/core/layer-styles'
import {
  dispatchLuaScriptDialogForActiveDocument,
  luaScriptTargetIsActive,
  runLuaScriptForActiveDocument
} from './lua-script-service'
import { useWorkspace } from './workspace'

const result = (overrides: Partial<LuaScriptRunResult> = {}): LuaScriptRunResult => ({
  sessionId: null,
  fileName: 'paint.lua',
  filePath: 'C:/scripts/paint.lua',
  output: [],
  elapsedMs: 3,
  batches: [],
  createdLayers: [],
  createdDocuments: [],
  dialogs: [],
  finished: true,
  ...overrides
})

beforeEach(() => {
  localStorage.clear()
  useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null })
})

describe('Lua script document service', () => {
  it('commits each Lua transaction through targeted pixel history', async () => {
    const document = createDocument('script target', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    let received: LuaScriptExecutionContext | null = null
    const red = 0xff0000ff
    const green = 0xff00ff00

    const outcome = await runLuaScriptForActiveDocument({
      runLuaScript: async (scriptId, context) => {
        expect(scriptId).toBe('paint.lua')
        received = context
        return result({
          output: ['done'],
          batches: [
            { label: 'Red', changes: [{ index: 0, before: 0, after: red }], surfaceChange: null },
            { label: 'Green', changes: [{ index: 1, before: 0, after: green }], surfaceChange: null }
          ]
        })
      }
    }, 'paint.lua')

    const layer = getActiveLayer(document)
    expect(received).toMatchObject({ documentName: 'script target', layerWidth: 2, layerHeight: 1, frameNumber: 1, selection: null })
    expect(outcome.summary).toMatchObject({ fileName: 'paint.lua', transactionCount: 2, changedPixelCount: 2, output: ['done'] })
    expect(outcome.session).toBeNull()
    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(red)
    expect(readLayerPacked(document, layer, 1) >>> 0).toBe(green)

    useWorkspace.getState().undo()
    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(red)
    expect(readLayerPacked(document, layer, 1) >>> 0).toBe(0)
    useWorkspace.getState().undo()
    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(0)
  })

  it('commits cel image replacement and position as one undoable transaction', async () => {
    const document = createDocument('surface target', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const red = 0xff0000ff

    const outcome = await runLuaScriptForActiveDocument({
      runLuaScript: async () => result({
        batches: [{
          label: 'Replace cel',
          changes: [],
          surfaceChange: {
            before: { format: 'rgba', width: 2, height: 2, offsetX: 0, offsetY: 0, pixels: [0, 0, 0, 0] },
            after: { format: 'rgba', width: 3, height: 2, offsetX: -1, offsetY: 1, pixels: [red, 0, 0, 0, 0, 0] }
          }
        }]
      })
    }, 'replace.lua')

    const layer = getActiveLayer(document)
    expect(outcome.summary).toMatchObject({ transactionCount: 1, changedPixelCount: 6 })
    expect(layer).toMatchObject({ width: 3, height: 2, offsetX: -1, offsetY: 1 })
    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(red)

    useWorkspace.getState().undo()
    expect(layer).toMatchObject({ width: 2, height: 2, offsetX: 0, offsetY: 0 })
    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(0)
    useWorkspace.getState().redo()
    expect(layer).toMatchObject({ width: 3, height: 2, offsetX: -1, offsetY: 1 })
    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(red)
  })

  it('commits a non-active frame cel surface and restores it on undo', async () => {
    const document = createDocument('multi-frame target', 2, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const layer = getActiveLayer(document)
    const timeline = ensureAnimationDocument(document)
    const firstFrameId = timeline.activeFrameId
    useWorkspace.getState().duplicateAnimationFrame()
    const secondFrameId = ensureAnimationDocument(document).activeFrameId
    const red = 0xff0000ff
    let firstCelId = ''

    const outcome = await runLuaScriptForActiveDocument({
      runLuaScript: async (_scriptId, context) => {
        expect(context.frameNumber).toBe(2)
        expect(context.activeLayerCels).toHaveLength(2)
        const first = context.activeLayerCels.find((cel) => cel.frameId === firstFrameId)!
        firstCelId = first.id
        return result({
          batches: [{
            label: 'Edit first frame',
            changes: [],
            surfaceChange: null,
            operations: [{
              path: 'animation.setCelSurface',
              arguments: {
                layerId: layer.id,
                frameId: firstFrameId,
                celId: first.id,
                before: first.surface,
                after: { ...first.surface, offsetX: 2, pixels: [red, 0] }
              }
            }]
          }]
        })
      }
    }, 'multi-frame.lua')

    expect(firstCelId).not.toBe('')
    expect(outcome.summary.changedPixelCount).toBe(1)
    const changed = animationLayerAtFrame(document, layer.id, firstFrameId)!
    expect(changed.offsetX).toBe(2)
    expect(readLayerPacked(document, changed, 0) >>> 0).toBe(red)
    expect(ensureAnimationDocument(document).activeFrameId).toBe(secondFrameId)

    useWorkspace.getState().undo()
    const restored = animationLayerAtFrame(document, layer.id, firstFrameId)!
    expect(restored.offsetX).toBe(0)
    expect(readLayerPacked(document, restored, 0) >>> 0).toBe(0)
    useWorkspace.getState().redo()
    expect(readLayerPacked(document, animationLayerAtFrame(document, layer.id, firstFrameId)!, 0) >>> 0).toBe(red)
  })

  it('creates a script layer through undoable store history', async () => {
    const document = createDocument('layer creation target', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const blue = 0xffff0000

    const outcome = await runLuaScriptForActiveDocument({
      runLuaScript: async () => result({
        createdLayers: [{
          id: 'lua-layer-1',
          name: 'Cube',
          opacity: 255,
          visible: true,
          locked: false,
          frameNumber: 1,
          surface: { format: 'rgba', width: 2, height: 2, offsetX: 0, offsetY: 0, pixels: [blue, 0, 0, 0] }
        }]
      })
    }, 'layer.lua')

    expect(outcome.summary).toMatchObject({ transactionCount: 1, changedPixelCount: 1 })
    expect(document.layers).toHaveLength(2)
    expect(document.activeLayerId).toBe('lua-layer-1')
    expect(readLayerPacked(document, getActiveLayer(document), 0) >>> 0).toBe(blue)

    useWorkspace.getState().undo()
    expect(document.layers).toHaveLength(1)
    useWorkspace.getState().redo()
    expect(document.layers).toHaveLength(2)
    expect(document.activeLayerId).toBe('lua-layer-1')
  })

  it('places an Aseprite-created layer below its source and restores the requested active layer', async () => {
    const document = createDocument('shadow target', 2, 2, 'rgba')
    useWorkspace.getState().addSession(document)
    const source = getActiveLayer(document)

    await runLuaScriptForActiveDocument({
      runLuaScript: async () => result({
        activeLayerId: source.id,
        activeFrameNumber: 1,
        createdLayers: [{
          id: 'lua-shadow',
          name: 'Shadow',
          opacity: 255,
          visible: true,
          locked: false,
          frameNumber: 1,
          parentGroupId: null,
          stackIndex: 1,
          surface: { format: 'rgba', width: 2, height: 2, offsetX: 0, offsetY: 0, pixels: [0xff000000, 0, 0, 0] }
        }]
      })
    }, 'shadow.lua')

    expect(document.layers.map((layer) => layer.id)).toEqual(['lua-shadow', source.id])
    expect(document.activeLayerId).toBe(source.id)
    expect(useWorkspace.getState().sessions[0].selectedLayerIds).toEqual([source.id])

    useWorkspace.getState().undo()
    expect(document.layers.map((layer) => layer.id)).toEqual([source.id])
  })





  it('exposes the structural MSE snapshot and commits a typed operation batch as one undo step', async () => {
    const document = createDocument('mse operations', 2, 2, 'rgba')
    const layer = getActiveLayer(document)
    useWorkspace.getState().addSession(document)
    let contextSnapshot: LuaScriptExecutionContext['mseSnapshot'] | null = null

    const outcome = await runLuaScriptForActiveDocument({
      runLuaScript: async (_scriptId, context) => {
        contextSnapshot = context.mseSnapshot
        return result({
          batches: [{
            label: 'MSE batch',
            changes: [],
            surfaceChange: null,
            operations: [
              { path: 'layers.update', arguments: { id: layer.id, name: 'Renamed', opacity: 128 } },
              { path: 'animation.setFrameDuration', arguments: { frame: 1, duration: 250 } },
              { path: 'palette.create', arguments: { color: { r: 12, g: 34, b: 56, a: 255 } } },
              { path: 'selection.set', arguments: { x: 0, y: 0, width: 1, height: 2 } }
            ]
          }]
        })
      }
    }, 'mse.lua')

    expect(contextSnapshot).toMatchObject({
      document: { id: document.id, activeLayer: { id: layer.id } },
      layers: [{ id: layer.id }],
      animation: { frames: [{ number: 1, active: true }] },
      workspace: { panels: expect.any(Array) }
    })
    expect(outcome.summary.transactionCount).toBe(1)
    expect(layer.name).toBe('Renamed')
    expect(layer.opacity).toBeCloseTo(128 / 255)
    expect(document.animation?.frames[0].duration).toBe(250)
    expect(document.palette.some((entry) => entry.color.r === 12 && entry.color.g === 34 && entry.color.b === 56)).toBe(true)
    expect(useWorkspace.getState().sessions[0].selection).toEqual({ x: 0, y: 0, width: 1, height: 2 })

    useWorkspace.getState().undo()
    expect(layer.name).not.toBe('Renamed')
    expect(document.animation?.frames[0].duration).toBe(100)
    expect(document.palette.some((entry) => entry.color.r === 12 && entry.color.g === 34 && entry.color.b === 56)).toBe(false)
    expect(useWorkspace.getState().sessions[0].selection).toBeNull()
  })

  it('rolls back pixel and MSE writes when a later operation in the transaction fails', async () => {
    const document = createDocument('mse rollback', 1, 1, 'rgba')
    const layer = getActiveLayer(document)
    const originalName = layer.name
    useWorkspace.getState().addSession(document)
    const session = useWorkspace.getState().sessions[0]
    const historyPosition = session.history.position
    const revision = session.revision
    const contentRevision = session.contentRevision
    const updatedAt = document.updatedAt

    await expect(runLuaScriptForActiveDocument({
      runLuaScript: async () => result({
        batches: [{
          label: 'Failing MSE batch',
          changes: [{ index: 0, before: 0, after: 0xff0000ff }],
          surfaceChange: null,
          operations: [
            { path: 'layers.update', arguments: { id: layer.id, name: 'Temporary name' } },
            { path: 'tiles.edit', arguments: { tilesetId: 'missing', tileId: 'missing', pixels: [] } }
          ]
        }]
      })
    }, 'rollback.lua')).rejects.toThrow('mse.tiles.edit')

    expect(readLayerPacked(document, layer, 0) >>> 0).toBe(0)
    expect(layer.name).toBe(originalName)
    expect(session.history.position).toBe(historyPosition)
    expect(document.dirty).toBe(false)
    expect(document.updatedAt).toBe(updatedAt)
    expect(session.revision).toBe(revision)
    expect(session.contentRevision).toBe(contentRevision)
  })





  it('rebases a persistent dialog callback after undo on the same cel', async () => {
    const document = createDocument('dialog undo target', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    const dialog = {
      id: 'dialog-1',
      title: 'Options',
      controls: [{
        id: 'apply',
        dataKey: 'apply',
        kind: 'button' as const,
        label: '',
        text: 'Apply',
        value: null,
        min: null,
        max: null,
        step: null,
        decimals: null,
        options: [],
        enabled: true,
        visible: true
      }]
    }
    const initial = await runLuaScriptForActiveDocument({
      runLuaScript: async () => result({ sessionId: 'lua-1', dialogs: [dialog], finished: false })
    }, 'dialog.lua')
    const red = 0xff0000ff
    const first = await dispatchLuaScriptDialogForActiveDocument({
      dispatchLuaScriptDialog: async (_sessionId, _action, context) => {
        expect(context.pixels).toEqual([0])
        return result({
          sessionId: 'lua-1',
          dialogs: [dialog],
          finished: false,
          batches: [{ label: 'Apply', changes: [{ index: 0, before: 0, after: red }], surfaceChange: null }]
        })
      }
    }, initial.session!, { dialogId: 'dialog-1', controlId: 'apply', event: 'click', values: {} })

    expect(readLayerPacked(document, getActiveLayer(document), 0) >>> 0).toBe(red)
    useWorkspace.getState().undo()
    expect(readLayerPacked(document, getActiveLayer(document), 0) >>> 0).toBe(0)

    await dispatchLuaScriptDialogForActiveDocument({
      dispatchLuaScriptDialog: async (_sessionId, _action, context) => {
        expect(context.pixels).toEqual([0])
        return result({
          sessionId: 'lua-1',
          dialogs: [dialog],
          finished: false,
          batches: [{ label: 'Apply again', changes: [{ index: 0, before: 0, after: red }], surfaceChange: null }]
        })
      }
    }, first.session!, { dialogId: 'dialog-1', controlId: 'apply', event: 'click', values: {} })

    expect(readLayerPacked(document, getActiveLayer(document), 0) >>> 0).toBe(red)
  })

  it('rejects results after the active target changes', async () => {
    const document = createDocument('stale target', 1, 1, 'rgba')
    useWorkspace.getState().addSession(document)
    let resolveResult!: (value: LuaScriptRunResult) => void
    const pending = runLuaScriptForActiveDocument({
      runLuaScript: async () => new Promise((resolve) => { resolveResult = resolve })
    }, 'stale.lua')

    await Promise.resolve()
    useWorkspace.getState().addLayer()
    resolveResult(result({
      fileName: 'stale.lua',
      batches: [{ label: 'Stale', changes: [{ index: 0, before: 0, after: 0xffffffff }], surfaceChange: null }]
    }))

    await expect(pending).rejects.toThrow('目标')
  })
})
