import { useEffect, useState, type CSSProperties } from 'react'
import { PET_ANIMATIONS, petSprites, type PetAnimationId, type PetId } from './petSprites'

/*
 * Two ways a market pet animates, both real pixel animation:
 *
 *  1. Animations cut from a .mspet pack (see catalog.ts): their frame images are
 *     layered and stepped one to the front at a time, so the pet holds still while
 *     only its pose changes.
 *  2. The code-drawn pets in petSprites.ts, kept for packs that have no artwork
 *     yet. Every authored frame is a stacked layer whose opacity steps on its own
 *     negative delay; an outer wrapper adds the movement.
 */

/** One animation inside a .mspet pack, cut into individual frame images. */
export type SpriteSheet = {
  /** Folder holding the frame images, named 00.png upward. */
  dir: string
  /** Frames in the animation. */
  frames: number
  /** Width of one frame in the artwork. */
  frameWidth: number
  /** Height of one frame in the artwork. */
  frameHeight: number
  /** Full loop length in ms, from the pack's per-frame durations. */
  duration: number
}

export function frameSrc(sheet: SpriteSheet, frame: number): string {
  return `${sheet.dir}/${String(frame).padStart(2, '0')}.png`
}

/**
 * Plays a .mspet animation one frame at a time, swapping a single image.
 *
 * CSS was the wrong tool here. Every CSS route interpolates something: animating
 * `background-position` slides the sheet across the window, and stepping opacity
 * blends two poses. Both read as flicker. Swapping one `src` cannot do either — the
 * window always holds exactly one frame — and the app itself flips frames the same way.
 *
 * Frames are pulled into the cache on mount so the swap is immediate; each is a few
 * hundred bytes.
 */
const preloaded = new Set<string>()

function preloadSheet(sheet: SpriteSheet) {
  if (preloaded.has(sheet.dir)) return
  preloaded.add(sheet.dir)
  for (let frame = 0; frame < sheet.frames; frame += 1) {
    const image = new Image()
    image.src = frameSrc(sheet, frame)
  }
}

export function PetSpriteStrip({ sheet, zoom = 2, className }: {
  sheet: SpriteSheet
  /** On-screen size of one artwork pixel. */
  zoom?: number
  className?: string
}) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    preloadSheet(sheet)
    setFrame(0)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const step = Math.max(16, Math.round(sheet.duration / sheet.frames))
    const timer = setInterval(() => setFrame((value) => (value + 1) % sheet.frames), step)
    return () => clearInterval(timer)
  }, [sheet])

  const style = {
    '--frame-px': `${sheet.frameWidth * zoom}px`,
    '--frame-py': `${sheet.frameHeight * zoom}px`,
  } as CSSProperties
  return <span className={`sprite-strip${className ? ` ${className}` : ''}`} style={style}>
    <img
      className="sprite-img"
      src={frameSrc(sheet, frame)}
      alt=""
      draggable={false}
      decoding="sync"
      width={sheet.frameWidth * zoom}
      height={sheet.frameHeight * zoom} />
  </span>
}

type PixelArtProps = {
  /** One entry per animation frame, each a list of equal-length pixel rows. */
  frames: string[][]
  legend: Record<string, string>
  /** Pixel size in CSS px. Falls back to the ancestor's --px variable. */
  px?: number
  className?: string
}

export function PixelArt({ frames, legend, px, className }: PixelArtProps) {
  const width = frames[0]?.[0]?.length ?? 0
  const style = {
    ...(px ? { '--px': `${px}px` } : null),
    '--cols': width,
    '--count': frames.length,
  } as CSSProperties

  return <span className={className ? `pixel-art ${className}` : 'pixel-art'} style={style} aria-hidden="true">
    {frames.map((rows, frame) => <span className="pixel-frame" key={frame}>
      <span className="pixel-cells">
        {rows.map((row, y) => <span className="pixel-row" key={y}>
          {Array.from(row).map((char, x) => char === '.'
            ? <i key={x} className="px-off" />
            : <i key={x} style={{ background: legend[char] ?? 'transparent' }} />)}
        </span>)}
      </span>
    </span>)}
  </span>
}

export function PixelPet({ pet, animation, px = 6, className, delay = 0 }: {
  pet: PetId
  animation: PetAnimationId
  px?: number
  className?: string
  /** Negative offset in ms so a row of pets does not breathe in lockstep. */
  delay?: number
}) {
  const sprite = petSprites[pet]
  const style = {
    '--px': `${px}px`,
    // --cycle drives the frame stepping on .pixel-cells; without it the whole
    // strip would sit on top of itself at zero duration.
    '--cycle': `${PET_ANIMATIONS[animation].duration}ms`,
    '--duration': `${PET_ANIMATIONS[animation].duration}ms`,
    '--delay': `${delay}ms`,
  } as CSSProperties

  return <span className={`pet pet-${pet} anim-${animation}${className ? ` ${className}` : ''}`} style={style}>
    <span className="pet-motion">
      <PixelArt frames={sprite.frames} legend={sprite.legend} />
    </span>
  </span>
}
