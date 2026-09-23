import { useEffect, useState } from 'react'
import { Button } from './primitives'
import { PixelArrowLeft } from './icons'

/** All routes share the document scroll position. */
export function BackToTop({ label, routeKey, supportLabel, topLabel }: { label: string; routeKey: string; supportLabel: string; topLabel: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const update = () => {
      setVisible(window.scrollY > Math.max(240, window.innerHeight / 2))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [routeKey])

  const back = () => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    window.scrollTo({ top: 0, behavior })
    // Keep keyboard users at the content after the floating button disappears.
    const main = document.getElementById('main')
    if (main) {
      main.tabIndex = -1
      main.focus({ preventScroll: true })
    }
  }
  return <div className="back-to-top">
    <Button className="floating-tool" href="#/support" ariaLabel={supportLabel}>{supportLabel}</Button>
    {visible && <Button className="floating-tool" onClick={back} ariaLabel={label} icon={<PixelArrowLeft className="back-to-top-arrow" />}>{topLabel}</Button>}
  </div>
}
