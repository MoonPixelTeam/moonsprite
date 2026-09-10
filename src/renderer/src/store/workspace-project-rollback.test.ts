import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColor, writeLayerColor } from '@/core/document'
import { projectRollbackProgress } from '@/core/project-rollback-progress'
import { useWorkspace } from './workspace'

const waitForRollbackProgress = async (): Promise<void> => {
  for (let frame = 0; frame < 6 && projectRollbackProgress.getSnapshot().active; frame += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  }
}

describe('project backup rollback', () => {
  beforeEach(() => {
    localStorage.clear()
    useWorkspace.setState({ sessions: [], activeId: null, message: null, saveProgress: null, dialog: null, recoveryRecords: [] })
  })

  it('restores a backup as one undoable document change while retaining its save identity', async () => {
    const document = createDocument('current', 1, 1, 'rgba')
    document.filePath = 'D:/projects/current.moonsprite'
    document.sourceFilePath = document.filePath
    const currentLayer = getActiveLayer(document)
    writeLayerColor(document, currentLayer, 0, { r: 255, g: 0, b: 0, a: 255 })
    useWorkspace.getState().addSession(document)

    const backup = createDocument('backup', 1, 1, 'rgba')
    writeLayerColor(backup, getActiveLayer(backup), 0, { r: 0, g: 0, b: 255, a: 255 })
    expect(useWorkspace.getState().restoreProjectBackup(document.id, backup)).toBe(true)

    let restored = useWorkspace.getState().sessions[0]!
    const rollbackRevision = restored.contentRevision
    expect(restored.document.filePath).toBe('D:/projects/current.moonsprite')
    expect(readLayerColor(restored.document, getActiveLayer(restored.document), 0)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
    expect(restored.history.canUndo).toBe(true)

    useWorkspace.getState().setHistoryPosition(0)
    expect(projectRollbackProgress.getSnapshot().active).toBe(true)
    await waitForRollbackProgress()
    expect(projectRollbackProgress.getSnapshot().active).toBe(false)
    restored = useWorkspace.getState().sessions[0]!
    expect(restored.contentRevision).toBeGreaterThan(rollbackRevision)
    expect(readLayerColor(restored.document, getActiveLayer(restored.document), 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 })

    useWorkspace.getState().setHistoryPosition(1)
    expect(projectRollbackProgress.getSnapshot().active).toBe(true)
    await waitForRollbackProgress()
    expect(projectRollbackProgress.getSnapshot().active).toBe(false)
    restored = useWorkspace.getState().sessions[0]!
    expect(restored.contentRevision).toBeGreaterThan(rollbackRevision + 1)
    expect(readLayerColor(restored.document, getActiveLayer(restored.document), 0)).toEqual({ r: 0, g: 0, b: 255, a: 255 })
  })
})
