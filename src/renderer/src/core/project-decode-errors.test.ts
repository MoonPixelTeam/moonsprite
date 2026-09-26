import { afterEach, expect, it, vi } from 'vitest'
import { createDocument } from './document-model'
import { decodeProject, encodeProject } from './project-format'
import * as zip from './project-format-zip'

afterEach(() => vi.restoreAllMocks())

it.each([1, 2])('retains allocation failure at archive read %i and opens valid data afterwards', failedRead => {
  const archive = encodeProject(createDocument('allocation failure', 2, 2, 'rgba'), { includePreview: false })
  const original = zip.projectZipFiles
  let reads = 0
  vi.spyOn(zip, 'projectZipFiles').mockImplementation((...args) => {
    if (++reads === failedRead) throw new RangeError('Array buffer allocation failed')
    return original(...args)
  })
  expect(() => decodeProject(archive)).toThrow('Array buffer allocation failed')
  expect(decodeProject(archive).width).toBe(2)
})
