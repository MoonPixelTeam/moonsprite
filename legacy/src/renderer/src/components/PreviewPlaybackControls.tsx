import { PlaybackPixelIcon } from './PlaybackPixelIcon'
import { RangeField } from './RangeField'
import { useI18n } from './I18nProvider'

/** Shared playback button and frame scrubber for animation previews. */
export function PreviewPlaybackControls({ playing, frame, frameCount, onToggle, onSeek }: {
  playing: boolean
  frame: number
  frameCount: number
  onToggle(): void
  onSeek(frame: number): void
}) {
  const { t } = useI18n()
  const lastFrame = Math.max(0, frameCount - 1)
  const currentFrame = Math.max(0, Math.min(frame, lastFrame))
  const label = t(playing ? 'timelapse.pausePreview' : 'timelapse.playPreview')
  return <div className="timelapse-preview-controls">
    <button type="button" className="icon-button" disabled={frameCount < 2} title={label} aria-label={label} onClick={onToggle}><PlaybackPixelIcon kind={playing ? 'pause' : 'play'} /></button>
    <RangeField ariaLabel={t('timelapse.previewPosition')} density="compact" min={0} max={lastFrame} value={currentFrame} valueLabel={frameCount === 0 ? '0 / 0' : `${currentFrame + 1} / ${frameCount}`} disabled={frameCount === 0} onChange={onSeek} />
  </div>
}
