import type { SpriteDocument } from '@shared/types-document'
import type { AppDialog } from './workspace-types'
import { imageSequenceBatches } from '@/core/image-sequence'
import { fileNameFromPath } from '@/core/document-files'
import { compositeRegionAsync } from '@/core/document-composite'
import { documentFromGifFrames } from '@/core/gif-import'
import { translateCurrent as tr } from '@/core/localization'
import { loadImageSequencePreference, saveImageSequencePreference, sequenceDuration, type ImageSequencePreference, type ImageSequenceSettings } from '@/core/image-sequence-preferences'

interface SequenceImportOptions {
  openPath(path: string): Promise<boolean>
  read(path: string): Promise<SpriteDocument>
  add(document: SpriteDocument): void
  ask(options: Omit<AppDialog, 'resolve'>): Promise<string>
  checkMemory(width: number, height: number, count: number): Promise<void>
  error(message: string): void
}

export async function openImageSequencePaths(paths: readonly string[], options: SequenceImportOptions): Promise<boolean> {
  let opened = false
  let repeated: ImageSequencePreference | null = loadImageSequencePreference()
  for (const batch of imageSequenceBatches(paths)) {
    if (batch.length === 1) { opened = await options.openPath(batch[0]) || opened; continue }
    const settings: ImageSequenceSettings = { duration: repeated?.duration ?? 100, repeat: false, remember: false }
    const choice = repeated?.choice ?? await options.ask({
      title: tr('sequence.title'), message: tr('sequence.message', { count: batch.length }),
      imageSequence: { files: batch.map(fileNameFromPath), settings },
      choices: [
        { id: 'cancel', label: tr('common.cancel'), tone: 'quiet' },
        { id: 'separate', label: tr('sequence.separate'), tone: 'quiet' },
        { id: 'animation', label: tr('sequence.animation'), tone: 'primary' }
      ]
    })
    if (choice === 'cancel' || !['separate', 'animation'].includes(choice)) break
    const selected = settings.selectedIndices ? batch.filter((_, index) => settings.selectedIndices!.includes(index)) : batch
    if (selected.length === 0) continue
    const decision: ImageSequencePreference = { choice: choice as ImageSequencePreference['choice'], duration: sequenceDuration(settings.duration) }
    if (settings.repeat || settings.remember) repeated = decision
    if (settings.remember && !saveImageSequencePreference(decision)) options.error(tr('sequence.rememberFailed'))
    if (choice === 'separate') {
      for (const path of selected) opened = await options.openPath(path) || opened
      continue
    }
    try {
      const frames: { pixels: Uint8ClampedArray; duration: number }[] = []
      let width = 0, height = 0
      for (const path of selected) {
        const source = await options.read(path)
        if (!width) {
          width = source.width; height = source.height
          await options.checkMemory(width, height, selected.length + 2)
        }
        if (source.width !== width || source.height !== height || (source.animation?.frames.length ?? 1) !== 1) throw new Error(tr('sequence.incompatible'))
        frames.push({ pixels: await compositeRegionAsync(source, 0, 0, width, height), duration: decision.duration })
      }
      const name = fileNameFromPath(selected[0]).replace(/\d+\.[^.]+$/, '').replace(/[-_ ]+$/, '') || 'Animation'
      const document = documentFromGifFrames(name, width, height, frames, true)
      document.dirty = true
      options.add(document)
      opened = true
    } catch (error) {
      options.error(error instanceof Error ? error.message : tr('workspace.open.error'))
    }
  }
  return opened
}
