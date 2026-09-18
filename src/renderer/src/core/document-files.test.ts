import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocument, createLayer, writeLayerColor } from './document'
import { decodeDocumentFile, decodeDocumentFileAsync, directSourceImageSaveTarget, encodeDocumentForPath, encodeDocumentForSourceImage, fileExtension, fileNameFromPath, isMoonSpriteBackupPath, isMoonSpriteProjectPath, joinDirectoryPath, normalizeSaveDialogPath, sanitizeFileStem, saveImageDialogFormat, saveImageKindForPath, shouldDecodeDocumentInWorker, sourceRasterImageKindForPath } from './document-files'
import { decodeProject, encodeProject } from './project-format'
import { initialDocumentComposite, initialDocumentCompositePending } from './initial-document-composite'
import { addBlankAnimationFrame } from './animation'
import { exportAnimationGif } from './gif'
import { encodePsd } from './psd'

describe('document file rules', () => {
  it.each(['jpg', 'jpeg', 'webp', 'bmp', 'png', 'gif'])('preserves GIF animation in a chat cache named .%s', async (extension) => {
    const source = createDocument('chat animation', 1, 1, 'rgba')
    writeLayerColor(source, source.layers[0], 0, { r: 255, g: 0, b: 0, a: 255 })
    addBlankAnimationFrame(source)
    writeLayerColor(source, source.layers[0], 0, { r: 0, g: 0, b: 255, a: 255 })
    source.animation!.frames[0].duration = 120
    source.animation!.frames[1].duration = 240
    const bytes = exportAnimationGif(source, { scalePercent: 100, direction: 'forward' }).bytes
    const path = `C:/chat/cache/image.${extension}`
    const progress = vi.fn()
    const imported = await decodeDocumentFileAsync(bytes, path, progress)
    expect(imported.animation!.frames.map((frame) => frame.duration)).toEqual([120, 240])
    expect(imported.animation!.cels[0].surface?.pixels).toEqual(new Uint8ClampedArray([255, 0, 0, 255]))
    expect(imported.animation!.cels[1].surface?.pixels).toEqual(new Uint8ClampedArray([0, 0, 255, 255]))
    expect(imported.sourceFilePath).toBe(path)
    expect(imported.filePath).toBeNull()
    expect(progress).toHaveBeenLastCalledWith(1)
    expect(decodeDocumentFile(bytes, path).animation!.frames).toHaveLength(2)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('normalizes platform paths and user-entered file names', () => {
    expect(fileNameFromPath('C:\\gallery\\sprite.moonsprite')).toBe('sprite.moonsprite')
    expect(fileExtension('/gallery/sprite.ASEPRITE')).toBe('aseprite')
    expect(sanitizeFileStem('8*8.aseprite', 'untitled')).toBe('8_8')
    expect(sanitizeFileStem('walk.gif', 'untitled')).toBe('walk')
    expect(sanitizeFileStem('tiles.bmp', 'untitled')).toBe('tiles')
    expect(sanitizeFileStem('layers.psd', 'untitled')).toBe('layers')
  })

  it('recognizes project backups without making them writable project paths', () => {
    expect(isMoonSpriteProjectPath('D:/gallery/sprite.moonsprite')).toBe(true)
    expect(isMoonSpriteProjectPath('D:/gallery/sprite.moonsprite.bak')).toBe(true)
    expect(isMoonSpriteBackupPath('D:/gallery/sprite.moonsprite.bak')).toBe(true)
    expect(isMoonSpriteBackupPath('D:/gallery/sprite.bak')).toBe(false)

    const restored = decodeDocumentFile(encodeProject(createDocument('sprite', 2, 2, 'rgba')), 'D:/gallery/sprite.moonsprite.bak')
    expect(restored.name).toBe('sprite.moonsprite')
    expect(restored.filePath).toBeNull()
    expect(restored.sourceFilePath).toBeUndefined()
  })

  it('keeps save dialog formats and suffixes consistent', () => {
    expect(saveImageDialogFormat('aseprite')).toBe('aseprite')
    expect(saveImageDialogFormat('psd')).toBe('psd')
    expect(saveImageDialogFormat('svg')).toBe('svg')
    expect(saveImageKindForPath('sprite.jpeg')).toBe('jpeg')
    expect(saveImageKindForPath('sprite.ico')).toBe('ico')
    expect(saveImageKindForPath('sprite.psd')).toBe('psd')
    expect(normalizeSaveDialogPath('sprite.png', 'aseprite')).toBe('sprite.aseprite')
    expect(normalizeSaveDialogPath('sprite.ase', 'aseprite')).toBe('sprite.ase')
    expect(normalizeSaveDialogPath('sprite.png', 'psd')).toBe('sprite.psd')
    expect(normalizeSaveDialogPath('sprite.psd', 'psd')).toBe('sprite.psd')
    expect(normalizeSaveDialogPath('sprite.png', 'svg')).toBe('sprite.svg')
    expect(normalizeSaveDialogPath('sprite.png', 'ico')).toBe('sprite.ico')
  })

  it('recognizes every imported raster format and only permits flat source-image saves', () => {
    expect(sourceRasterImageKindForPath('sprite.png')).toBe('png-auto')
    expect(sourceRasterImageKindForPath('sprite.jpeg')).toBe('jpeg')
    expect(sourceRasterImageKindForPath('sprite.webp')).toBe('webp')
    expect(sourceRasterImageKindForPath('sprite.bmp')).toBe('bmp')
    expect(sourceRasterImageKindForPath('sprite.gif')).toBe('gif')

    const flat = createDocument('sprite.png', 2, 2, 'rgba')
    flat.sourceFilePath = 'D:/imports/sprite.png'
    expect(directSourceImageSaveTarget(flat)).toEqual({ filePath: 'D:/imports/sprite.png', format: 'png-auto' })

    const layered = createDocument('layered.png', 2, 2, 'rgba')
    layered.sourceFilePath = 'D:/imports/layered.png'
    layered.layers.push(createLayer('Layer 2', 2, 2, 'rgba'))
    expect(directSourceImageSaveTarget(layered)).toBeNull()

    const animated = createDocument('animated.gif', 2, 2, 'rgba')
    animated.sourceFilePath = 'D:/imports/animated.gif'
    addBlankAnimationFrame(animated)
    expect(directSourceImageSaveTarget(animated)).toBeNull()
  })





  it('restores MoonSprite file identity and encodes project saves', async () => {
    const document = createDocument('sprite', 8, 8, 'rgba')
    const path = 'D:\\gallery\\sprite.moonsprite'
    const restored = decodeDocumentFile(encodeProject(document), path)
    expect(restored.filePath).toBe(path)
    expect(restored.sourceFilePath).toBe(path)
    expect(restored.name).toBe('sprite.moonsprite')
    const activePixels = restored.layers[0].pixels
    const encoded = await encodeDocumentForPath(restored, path, null, 100)
    const saved = decodeProject(encoded)
    expect(saved).toMatchObject({ width: restored.width, height: restored.height, colorMode: restored.colorMode })
    expect(saved.layers[0].pixels).toEqual(activePixels)
    expect(restored.layers[0].pixels).toBe(activePixels)
    expect(activePixels.byteLength).toBeGreaterThan(0)
  })

  it('infers PSD encoding from a Save As path', async () => {
    const document = createDocument('layered', 2, 2, 'rgba')
    const encoded = await encodeDocumentForPath(document, 'D:\\gallery\\layered.psd', null, 100)

    expect(new TextDecoder().decode(encoded.subarray(0, 4))).toBe('8BPS')
  })

  it('opens PSD as an imported source that must be saved as a MoonSprite project', () => {
    const source = createDocument('layered', 2, 2, 'rgba')
    const imported = decodeDocumentFile(encodePsd(source), 'D:\\imports\\layered.psd')

    expect(imported).toMatchObject({ name: 'layered.psd', filePath: null, sourceFilePath: 'D:\\imports\\layered.psd', width: 2, height: 2 })
    expect(imported.layers).toHaveLength(1)
    expect(shouldDecodeDocumentInWorker(new Uint8Array(16), 'layered.psd')).toBe(true)
  })



  it('uses one worker decode per project and keeps composite or worker failures recoverable', async () => {
    const documents = [createDocument('first', 2, 2, 'rgba'), createDocument('second', 2, 2, 'rgba')]
    const workers: Array<{ onmessage: ((event: MessageEvent) => void) | null; terminated: boolean }> = []
    const messages: Array<{ id: number; filePath: string; prepareInitialComposite?: boolean }> = []
    const finishComposite: Array<() => void> = []
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      terminated = false
      constructor() { workers.push(this) }
      postMessage(message: { id: number; filePath: string; prepareInitialComposite?: boolean }): void {
        messages.push(message)
        if (message.filePath === 'fallback.moonsprite') {
          this.onerror?.({ message: 'worker channel closed' } as ErrorEvent)
          return
        }
        const document = documents.shift()!
        this.onmessage?.({ data: { id: message.id, progress: 1 } } as MessageEvent)
        this.onmessage?.({ data: { id: message.id, document, initialCompositePending: true } } as MessageEvent)
        finishComposite.push(document.name === 'first'
          ? () => this.onmessage?.({ data: { id: message.id, initialComposite: new Uint8ClampedArray(16), completed: true } } as MessageEvent)
          : () => this.onmessage?.({ data: { id: message.id, completed: true, error: 'composite failed' } } as MessageEvent))
      }
      terminate(): void { this.terminated = true }
    }
    vi.stubGlobal('Worker', FakeWorker)

    const first = await decodeDocumentFileAsync(new Uint8Array([1]), 'first.moonsprite')
    expect(first).toMatchObject({ name: 'first' })
    expect(initialDocumentComposite(first)).toBeNull()
    expect(initialDocumentCompositePending(first)).toBe(true)
    expect(messages).toMatchObject([{ filePath: 'first.moonsprite', prepareInitialComposite: true }])

    finishComposite.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(messages).toHaveLength(1)
    expect(initialDocumentCompositePending(first)).toBe(false)
    expect(initialDocumentComposite(first)?.pixels).toHaveLength(16)

    const second = await decodeDocumentFileAsync(new Uint8Array([2]), 'second.moonsprite')
    expect(initialDocumentCompositePending(second)).toBe(true)
    finishComposite.shift()?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(initialDocumentCompositePending(second)).toBe(false)
    expect(initialDocumentComposite(second)).toBeNull()

    const fallbackSource = encodeProject(createDocument('fallback source', 1025, 1025, 'rgba'), { includePreview: false })
    await expect(decodeDocumentFileAsync(fallbackSource, 'fallback.moonsprite')).resolves.toMatchObject({ name: 'fallback.moonsprite' })
    expect(messages).toHaveLength(3)
    expect(workers).toHaveLength(1)
    expect(documents).toHaveLength(0)
    expect(workers[0].terminated).toBe(true)
  })
})
