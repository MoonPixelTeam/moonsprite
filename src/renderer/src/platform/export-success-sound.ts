import soundUrl from '@/assets/export-success.wav?url'
import { recordRuntimeDiagnostic } from '@/core/runtime-diagnostics'

let context: AudioContext | null = null
let buffer: Promise<AudioBuffer> | null = null
let installed = false
let audioErrorReported = false

const reportAudioError = (error: unknown): void => {
  if (audioErrorReported) return
  audioErrorReported = true
  recordRuntimeDiagnostic('error', 'audio.export-success', { message: error instanceof Error ? error.message : String(error) })
}

const prepareAudio = (): AudioContext | null => {
  if (typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  const current = context
  if (!buffer) {
    buffer = fetch(soundUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Success sound load failed (${response.status})`)
      return current.decodeAudioData(await response.arrayBuffer())
    })
    // Preloading starts on a user gesture, well before a lengthy export ends.
    void buffer.catch(reportAudioError)
  }
  return current
}

/** Unlock playback during a real gesture; exporting may take minutes. */
export const installExportSuccessSound = (): void => {
  if (installed) return
  installed = true
  const unlock = (event: Event): void => {
    // Opening an audio device can block synchronously in WebView2. Never put
    // export-sound warmup on the first canvas stroke or a drawing shortcut.
    const target = event.target
    if (!(target instanceof Element) || target.closest('.stage-wrap')
      || !target.closest('button, input, select, textarea, [role="menuitem"]')) return
    try {
      const audio = prepareAudio()
      if (audio?.state === 'suspended') void audio.resume().catch(reportAudioError)
    } catch (error) { reportAudioError(error) }
  }
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true })
  window.addEventListener('keydown', unlock, { capture: true, passive: true })
}

/** Completion feedback must never delay or turn a successful export into a failure. */
export const playExportSuccessSound = (): void => {
  void (async () => {
    const audio = prepareAudio()
    if (!audio || !buffer) return
    if (audio.state === 'suspended') await audio.resume()
    const decoded = await buffer
    const source = audio.createBufferSource()
    source.buffer = decoded
    source.connect(audio.destination)
    source.onended = () => source.disconnect()
    source.start()
  })().catch(reportAudioError)
}
