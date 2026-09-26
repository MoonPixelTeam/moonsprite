import { beforeEach, expect, it } from 'vitest'
import { createDocument, getActiveLayer, readLayerColorAt, writeLayerColor } from '@/core/document'
import { selectionContains } from '@/core/selection'
import { useWorkspace } from './workspace'
beforeEach(() => { localStorage.clear(); useWorkspace.setState({ sessions: [], activeId: null }) })
it.each([false, true].flatMap(masked => [{x:12.5,y:14.5}, {x:12,y:12}, {x:14,y:14}, {x:10.25,y:11.75}].map(pivot => ({masked,pivot}))))('keeps pixel coverage and ants identical (mask=$masked, pivot=$pivot)', ({masked,pivot}) => {
  const doc = createDocument('pivot alignment', 40, 40, 'rgba'), layer = getActiveLayer(doc)
  const mask = masked ? new Uint8Array([0,1,0,0, 1,1,1,0, 1,1,1,1, 0,1,1,0]) : undefined
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!mask || mask[y * 4 + x])
    writeLayerColor(doc, layer, (12 + y) * 40 + 12 + x, { r: 70, g: 80, b: 190, a: 255 })
  const store = useWorkspace.getState(); store.addSession(doc)
  store.setSelection({ x: 12, y: 12, width: 4, height: 4, mask })
  store.setSelectionPivot(pivot)
  for (const patch of [{width:7,height:5}, {width:-9}, {height:-7}, {width:4,height:4}, {angle:37}, {width:7,height:5}, {angle:0}, {shearAngle:20}, {width:-5}, {shearAngle:0}]) {
    store.updateSelectionProperties(patch)
    const session = useWorkspace.getState().sessions[0]
    expect(session.selectionPivot).toEqual(pivot)
    expect(session.selection).not.toBeNull()
    for (const value of [session.selection!.x, session.selection!.y, session.selection!.width, session.selection!.height]) expect(Number.isInteger(value)).toBe(true)
    const mismatch: string[] = []
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const selected = selectionContains(session.selection!, x, y)
      const painted = readLayerColorAt(doc, layer, x, y).a > 0
      if (selected !== painted) mismatch.push(`${x},${y}:${selected}/${painted}`)
    }
    expect(mismatch, JSON.stringify(patch)).toEqual([])
  }
})
