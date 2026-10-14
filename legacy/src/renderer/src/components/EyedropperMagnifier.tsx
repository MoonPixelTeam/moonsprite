import type { CSSProperties, Ref } from 'react'
import eyedropperMagnifierFrame from '@/assets/eyedropper-magnifier-frame.svg?raw'
import eyedropperMagnifierSampledMask from '@/assets/eyedropper-magnifier-sampled-mask.svg?raw'
import eyedropperMagnifierPreviousMask from '@/assets/eyedropper-magnifier-previous-mask.svg?raw'
import eyedropperPointerDark from '@/assets/pixel-icons/02-Slice-2.png'
import eyedropperPointerLight from '@/assets/pixel-icons/03-Slice-3.png'

interface EyedropperMagnifierProps {
  canvasRef: Ref<HTMLCanvasElement>
  canvasSize: number
  styleMode: string
  size: number
  className?: string
  distortionEnabled?: boolean
  hidden?: boolean
  style?: CSSProperties
  magnifierRef?: Ref<HTMLDivElement>
  sampledMaskRef?: Ref<HTMLSpanElement>
  previousMaskRef?: Ref<HTMLSpanElement>
  pointerDarkRef?: Ref<HTMLImageElement>
  pointerLightRef?: Ref<HTMLImageElement>
  pointerTone?: 'dark' | 'light'
}

/** Shared eyedropper lens shell used by both the canvas tool and global color dragging. */
export function EyedropperMagnifier({
  canvasRef,
  canvasSize,
  styleMode,
  size,
  className = '',
  distortionEnabled,
  hidden,
  style,
  magnifierRef,
  sampledMaskRef,
  previousMaskRef,
  pointerDarkRef,
  pointerLightRef,
  pointerTone
}: EyedropperMagnifierProps) {
  return <div ref={magnifierRef} className={`eyedropper-magnifier ${className}`.trim()} data-style={styleMode} data-size={String(size)} data-distortion={distortionEnabled === undefined ? undefined : String(distortionEnabled)} style={style} hidden={hidden} aria-hidden="true">
    <div className="eyedropper-magnifier-viewport"><canvas ref={canvasRef} width={canvasSize} height={canvasSize} aria-hidden="true" /></div>
    {pointerTone
      ? <img className="global-eyedropper-magnifier-pointer" src={pointerTone === 'light' ? eyedropperPointerLight : eyedropperPointerDark} alt="" aria-hidden="true" />
      : <>
          <img ref={pointerDarkRef} src={eyedropperPointerDark} alt="" aria-hidden="true" />
          <img ref={pointerLightRef} src={eyedropperPointerLight} alt="" aria-hidden="true" />
        </>}
    <span ref={sampledMaskRef} className="eyedropper-magnifier-color-mask eyedropper-magnifier-sampled-mask" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eyedropperMagnifierSampledMask }} />
    <span ref={previousMaskRef} className="eyedropper-magnifier-color-mask eyedropper-magnifier-previous-mask" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eyedropperMagnifierPreviousMask }} />
    <span className="eyedropper-magnifier-frame" aria-hidden="true" dangerouslySetInnerHTML={{ __html: eyedropperMagnifierFrame }} />
  </div>
}
