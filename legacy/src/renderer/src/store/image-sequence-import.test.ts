import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_SEQUENCE_PREFERENCE_KEY } from '@/core/image-sequence-preferences'

beforeEach(() => localStorage.removeItem(IMAGE_SEQUENCE_PREFERENCE_KEY))

it.each(['animation', 'separate'])('imports only checked files for %s in original sequence order', async (choice) => {
  const options = setup()
  options.ask.mockImplementation(async (dialog) => {
    dialog.imageSequence.settings.selectedIndices = [2, 0]
    return choice
  })
  await openImageSequencePaths(['a1.png', 'a2.png', 'a3.png'], options)
  const reader = choice === 'animation' ? options.read : options.openPath
  expect(reader.mock.calls.map(([path]) => path)).toEqual(['a1.png', 'a3.png'])
})

it('does not import or remember a choice when no files are selected', async () => {
  const options = setup()
  options.ask.mockImplementation(async (dialog) => {
    dialog.imageSequence.settings.selectedIndices = []
    dialog.imageSequence.settings.remember = true
    return 'animation'
  })
  expect(await openImageSequencePaths(['a1.png', 'a2.png'], options)).toBe(false)
  expect(options.read).not.toHaveBeenCalled()
  expect(options.add).not.toHaveBeenCalled()
  expect(localStorage.getItem(IMAGE_SEQUENCE_PREFERENCE_KEY)).toBeNull()
})
import { createDocument } from '@/core/document-model'
import { imageSequenceBatches } from '@/core/image-sequence'
import { openImageSequencePaths } from './image-sequence-import'

describe('image sequence detection', () => {
  it('sorts numeric frames, handles zero padding rollover and leaves unrelated paths alone', () => {
    expect(imageSequenceBatches(['C:/walk010.png', 'C:/walk009.png', 'C:/other.png', 'C:/walk011.png']))
      .toEqual([['C:/walk009.png', 'C:/walk010.png', 'C:/walk011.png'], ['C:/other.png']])
    expect(imageSequenceBatches(['run10.png', 'run9.png'])).toEqual([['run9.png', 'run10.png']])
  })
  it('does not combine gaps, different directories, padding, formats or existing animations', () => {
    const paths = ['a/run1.png', 'b/run2.png', 'a/run3.png', 'a/run04.png', 'a/run5.jpg', 'a/run6.gif']
    expect(imageSequenceBatches(paths)).toEqual(paths.map((path) => [path]))
    expect(imageSequenceBatches(['run01.png', 'run02.png', 'run04.png', 'run05.png']))
      .toEqual([['run01.png', 'run02.png'], ['run04.png', 'run05.png']])
  })
  it('deduplicates Windows path aliases', () => {
    expect(imageSequenceBatches(['C:\\run1.png', 'c:/RUN1.PNG', 'C:/run2.png']))
      .toEqual([['C:\\run1.png', 'C:/run2.png']])
  })
})

const setup = (choice = 'animation') => ({
  ask: vi.fn().mockResolvedValue(choice),
  read: vi.fn(async (path: string) => {
    const document = createDocument(path, 1, 1, 'rgba')
    document.layers[0].pixels.set([path.includes('1') ? 255 : 0, 20, 30, 128])
    return document
  }),
  openPath: vi.fn().mockResolvedValue(true), add: vi.fn(),
  checkMemory: vi.fn().mockResolvedValue(undefined), error: vi.fn()
})

it('reuses the choice and duration for this batch only', async () => {
  const options = setup()
  options.ask.mockImplementation(async (dialog) => {
    dialog.imageSequence.settings.repeat = true
    dialog.imageSequence.settings.duration = 250
    return 'animation'
  })
  await openImageSequencePaths(['a1.png', 'a2.png', 'b1.png', 'b2.png'], options)
  expect(options.ask).toHaveBeenCalledTimes(1)
  expect(options.add).toHaveBeenCalledTimes(2)
  expect(options.add.mock.calls[1][0].animation.frames[0].duration).toBe(250)
  expect(localStorage.getItem(IMAGE_SEQUENCE_PREFERENCE_KEY)).toBeNull()
  const next = setup('cancel')
  await openImageSequencePaths(['a1.png', 'a2.png'], next)
  expect(next.ask).toHaveBeenCalledTimes(1)
})

it.each(['animation', 'separate'])('remembers %s for later imports', async (choice) => {
  const options = setup()
  options.ask.mockImplementation(async (dialog) => {
    dialog.imageSequence.settings.remember = true
    dialog.imageSequence.settings.duration = 180
    return choice
  })
  await openImageSequencePaths(['a1.png', 'a2.png'], options)
  const next = setup()
  await openImageSequencePaths(['b1.png', 'b2.png'], next)
  expect(next.ask).not.toHaveBeenCalled()
  if (choice === 'animation') expect(next.add.mock.calls[0][0].animation.frames[0].duration).toBe(180)
  else expect(next.openPath).toHaveBeenCalledTimes(2)
})

it('does not remember cancel and ignores invalid stored choices', async () => {
  localStorage.setItem(IMAGE_SEQUENCE_PREFERENCE_KEY, '{"choice":"invalid","duration":100}')
  const options = setup()
  options.ask.mockImplementation(async (dialog) => {
    dialog.imageSequence.settings.remember = true
    return 'cancel'
  })
  await openImageSequencePaths(['a1.png', 'a2.png'], options)
  expect(options.ask).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(IMAGE_SEQUENCE_PREFERENCE_KEY)).toContain('invalid')
  expect(options.add).not.toHaveBeenCalled()
})

it('asks before reading, then builds one unsaved animation without quantizing alpha', async () => {
  const options = setup()
  options.ask.mockImplementation(async () => { expect(options.read).not.toHaveBeenCalled(); return 'animation' })
  expect(await openImageSequencePaths(['run2.png', 'run1.png'], options)).toBe(true)
  expect(options.read.mock.calls.map(([path]) => path)).toEqual(['run1.png', 'run2.png'])
  expect(options.add).toHaveBeenCalledTimes(1)
  const document = options.add.mock.calls[0][0]
  expect(document.animation.frames.map((frame: { duration: number }) => frame.duration)).toEqual([100, 100])
  expect([...document.animation.cels[0].surface.pixels]).toEqual([255, 20, 30, 128])
  expect([...document.animation.cels[1].surface.pixels]).toEqual([0, 20, 30, 128])
  expect(document.dirty).toBe(true)
  expect(document.filePath).toBeNull()
  expect(document.sourceFilePath).toBeUndefined()
  expect(options.openPath).not.toHaveBeenCalled()
})

it('opens separately only when chosen, and cancel does not open or decode anything', async () => {
  const separate = setup('separate')
  await openImageSequencePaths(['run2.png', 'run1.png'], separate)
  expect(separate.openPath.mock.calls).toEqual([['run1.png'], ['run2.png']])
  expect(separate.read).not.toHaveBeenCalled()
  const cancel = setup('cancel')
  expect(await openImageSequencePaths(['run1.png', 'run2.png', 'other.png'], cancel)).toBe(false)
  expect(cancel.openPath).not.toHaveBeenCalled()
  expect(cancel.read).not.toHaveBeenCalled()
})

it('rejects mismatched dimensions and memory failures without creating partial sessions', async () => {
  const options = setup()
  options.read.mockResolvedValueOnce(createDocument('first', 2, 2, 'rgba'))
  expect(await openImageSequencePaths(['run1.png', 'run2.png'], options)).toBe(false)
  expect(options.add).not.toHaveBeenCalled()
  expect(options.error).toHaveBeenCalledTimes(1)
  const limited = setup()
  limited.checkMemory.mockRejectedValueOnce(new Error('memory limit'))
  await openImageSequencePaths(['run1.png', 'run2.png'], limited)
  expect(limited.read).toHaveBeenCalledTimes(1)
  expect(limited.add).not.toHaveBeenCalled()
  expect(limited.error).toHaveBeenCalledWith('memory limit')
})

it('reports corrupt input and rejects existing animated sources', async () => {
  const broken = setup()
  broken.read.mockRejectedValueOnce(new Error('decode failed'))
  await openImageSequencePaths(['run1.png', 'run2.png'], broken)
  expect(broken.error).toHaveBeenCalledWith('decode failed')
  expect(broken.add).not.toHaveBeenCalled()
  const animated = setup()
  const document = createDocument('animated', 1, 1, 'rgba')
  document.animation!.frames.push({ id: 'second', duration: 100 })
  animated.read.mockResolvedValueOnce(document)
  await openImageSequencePaths(['run1.png', 'run2.png'], animated)
  expect(animated.add).not.toHaveBeenCalled()
  expect(animated.error).toHaveBeenCalledTimes(1)
})
