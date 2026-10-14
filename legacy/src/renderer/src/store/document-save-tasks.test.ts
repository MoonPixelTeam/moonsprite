import { expect, it } from 'vitest'
import { runDocumentSave, waitForDocumentSaves } from './document-save-tasks'

it('drains saves added while waiting without waiting on other documents for a tab close', async () => {
  let first!: (value: boolean) => void, second!: (value: boolean) => void, other!: (value: boolean) => void
  const a = runDocumentSave('a', () => new Promise(resolve => { first = resolve }))
  const b = runDocumentSave('b', () => new Promise(resolve => { other = resolve }))
  let finished = false
  const closing = waitForDocumentSaves('a').then(result => { finished = true; return result })
  const queued = runDocumentSave('a', () => new Promise(resolve => { second = resolve }))
  first(true)
  await a
  await Promise.resolve()
  expect(finished).toBe(false)
  second(true)
  expect(await closing).toBe(true)
  other(true)
  await Promise.all([b, queued])
})

it('propagates an unexpected save error and clears it for a later close attempt', async () => {
  let fail!: (error: Error) => void
  const save = runDocumentSave('error', () => new Promise((_, reject) => { fail = reject }))
  const saving = expect(save).rejects.toThrow('write failed')
  const closing = expect(waitForDocumentSaves()).rejects.toThrow('write failed')
  fail(new Error('write failed'))
  await Promise.all([saving, closing])
  expect(await waitForDocumentSaves()).toBe(true)
})
