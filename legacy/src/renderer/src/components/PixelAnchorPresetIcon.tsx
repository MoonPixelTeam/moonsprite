import type { CanvasAnchor } from '@shared/types-selection'
import nw from '@/assets/pixel-icons/anchor-preset-nw.svg?raw'
import n from '@/assets/pixel-icons/anchor-preset-n.svg?raw'
import ne from '@/assets/pixel-icons/anchor-preset-ne.svg?raw'
import w from '@/assets/pixel-icons/anchor-preset-w.svg?raw'
import center from '@/assets/pixel-icons/anchor-preset-center.svg?raw'
import e from '@/assets/pixel-icons/anchor-preset-e.svg?raw'
import sw from '@/assets/pixel-icons/anchor-preset-sw.svg?raw'
import s from '@/assets/pixel-icons/anchor-preset-s.svg?raw'
import se from '@/assets/pixel-icons/anchor-preset-se.svg?raw'

export const ANCHOR_PRESETS = ["nw", "n", "ne", "w", "center", "e", "sw", "s", "se"] as const

const markup: Record<CanvasAnchor, string> = { nw, n, ne, w, center, e, sw, s, se }

/** Exact 11 x 11 reference pixels, including alpha; colour follows the theme. */
export function PixelAnchorPresetIcon({ anchor }: { anchor: CanvasAnchor }) {
  return <span className="pixel-anchor-preset-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup[anchor] }} />
}
