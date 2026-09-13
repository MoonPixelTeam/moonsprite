import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@/core/document-model'
import { sessionFromDocument } from './workspace-session'
import { mutateDocumentSession } from './workspace-mutation'
import { completeDocumentChange } from './workspace-document-change'

const createSession = () => {
  const session = sessionFromDocument(createDocument('mutation', 4, 4, 'rgba'))
  session.document.dirty = false
  return session
}

describe('document mutation completion', () => {
  it('invalidates content before notifying the recording owner and keeps UI completion inert', () => {
    const session = createSession(), content = session.contentRevision
    const record = vi.fn(() => {
      expect(session.document.dirty).toBe(true)
      expect(session.contentRevision).toBe(content + 1)
    })
    completeDocumentChange(session, 'ui', record)
    expect(record).not.toHaveBeenCalled()
    completeDocumentChange(session, 'content', record, {kind: 'full'})
    expect(record).toHaveBeenCalledExactlyOnceWith(session, undefined, true)
  })
  it('publishes view changes without creating document content or recording work', () => {
    const session = createSession(), record = vi.fn()
    const revision = session.revision, uiRevision = session.uiRevision, content = session.contentRevision, history = session.history.revision
    mutateDocumentSession(session, (current) => { current.view.panX = 20 }, { change: 'ui' }, record)
    expect(session.revision).toBe(revision)
    expect(session.uiRevision).toBe(uiRevision + 1)
    expect(session.contentRevision).toBe(content)
    expect(session.history.revision).toBe(history)
    expect(session.document.dirty).toBe(false)
    expect(record).not.toHaveBeenCalled()
  })

  it('marks metadata dirty without invalidating pixels or capturing a drawing frame', () => {
    const session = createSession(), record = vi.fn(), content = session.contentRevision
    mutateDocumentSession(session, (current) => { current.document.name = 'renamed' }, { change: 'metadata' }, record)
    expect(session.document.dirty).toBe(true)
    expect(session.contentRevision).toBe(content)
    expect(record).toHaveBeenCalledExactlyOnceWith(session, undefined, false)
  })

  it('records content and normalizes stale layer selection before publishing', () => {
    const session = createSession(), record = vi.fn(), content = session.contentRevision
    mutateDocumentSession(session, (current) => { current.selectedLayerIds = ['missing'] }, { change: 'content' }, record)
    expect(session.contentRevision).toBe(content + 1)
    expect(session.selectedLayerIds).toEqual([session.document.activeLayerId])
    expect(record).toHaveBeenCalledExactlyOnceWith(session, undefined, true)
  })

  it('clears the history normalization flag even when the command throws', () => {
    const session = createSession(), record = vi.fn()
    const flag = vi.spyOn(session.history, 'setAnimationSelectionNormalizationRequested')
    expect(() => mutateDocumentSession(session, () => { throw new Error('failed edit') }, {
      change: 'content', markSelectionNormalizationHistory: true
    }, record)).toThrow('failed edit')
    expect(flag.mock.calls).toEqual([[true], [false]])
    expect(record).not.toHaveBeenCalled()
  })
})
