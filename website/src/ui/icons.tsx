import cartSvg from '../assets/icons/cart.svg?raw'
import userSignedOutSvg from '../assets/icons/userSignedOut.svg?raw'
import userSignedInSvg from '../assets/icons/userSignedIn.svg?raw'
import sunSvg from '../assets/icons/sun.svg?raw'
import moonSvg from '../assets/icons/moon.svg?raw'
import languageSvg from '../assets/icons/language.svg?raw'
import type { SVGProps } from 'react'
import checkSvg from '../assets/icons/check.svg?raw'
import closeSvg from '../assets/icons/close.svg?raw'
import deleteSvg from '../assets/icons/delete.svg?raw'
import downSvg from '../assets/icons/down.svg?raw'
import exportSvg from '../assets/icons/export.svg?raw'
import folderSvg from '../assets/icons/folder.svg?raw'
import imageSvg from '../assets/icons/image.svg?raw'
import importSvg from '../assets/icons/import.svg?raw'
import leftSvg from '../assets/icons/left.svg?raw'
import lockSvg from '../assets/icons/lock.svg?raw'
import minusSvg from '../assets/icons/minus.svg?raw'
import moreLinesSvg from '../assets/icons/moreLines.svg?raw'
import pencilSvg from '../assets/icons/tilePaint.svg?raw'
import playSvg from '../assets/icons/play.svg?raw'
import plusSvg from '../assets/icons/plus.svg?raw'
import propertiesSvg from '../assets/icons/properties.svg?raw'
import rightSvg from '../assets/icons/right.svg?raw'

/** Trusted, checked-in MoonSprite SVG copies only. Paths are never sourced from user input. */
function fromSvg(markup: string) {
  const viewBox = markup.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 16 16'
  const sourceSize = Number(viewBox.split(' ')[2])
  const body = markup.replaceAll('fill="#fff"', 'fill="currentColor"').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  if (sourceSize > 11) throw new Error('Website icons require an 11px source canvas')
  const offset = Math.floor((11 - sourceSize) / 2)
  const pixels = `<g transform="translate(${offset} ${offset})">${body}</g>`
  return function PixelIcon(props: SVGProps<SVGSVGElement>) {
    return <svg {...props} width={22} height={22} viewBox="0 0 11 11" shapeRendering="crispEdges" aria-hidden="true" focusable="false" className={['site-pixel-icon', props.className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: pixels }} />
  }
}
export const PixelArrowLeft = fromSvg(leftSvg)
export const PixelArrowRight = fromSvg(rightSvg)
export const PixelChevronLeft = fromSvg(leftSvg)
export const PixelChevronRight = fromSvg(rightSvg)
export const PixelChevronDown = fromSvg(downSvg)
export const PixelCheck = fromSvg(checkSvg)
export const PixelPlus = fromSvg(plusSvg)
export const PixelMinus = fromSvg(minusSvg)
export const PixelX = fromSvg(closeSvg)
export const PixelTrash2 = fromSvg(deleteSvg)
export const PixelSettings = fromSvg(propertiesSvg)
export const PixelKeyRound = fromSvg(lockSvg)
export const PixelImagePlus = fromSvg(imageSvg)
export const PixelDownload = fromSvg(exportSvg)
export const PixelUpload = fromSvg(importSvg)
export const PixelPlay = fromSvg(playSvg)
export const PixelPencil = fromSvg(pencilSvg)
export const PixelMenu = fromSvg(moreLinesSvg)
export const PixelFileArchive = fromSvg(folderSvg)

export const PixelCart = fromSvg(cartSvg)
export const PixelUserSignedOut = fromSvg(userSignedOutSvg)
export const PixelUserSignedIn = fromSvg(userSignedInSvg)
export const PixelSun = fromSvg(sunSvg)
export const PixelMoon = fromSvg(moonSvg)
export const PixelLanguage = fromSvg(languageSvg)
