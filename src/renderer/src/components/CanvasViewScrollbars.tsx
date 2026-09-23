import { useEffect } from 'react'
import { Scrollbar } from './Scrollbar'
import { useCanvasViewScrollbars } from './useCanvasViewScrollbars'

type Props = Parameters<typeof useCanvasViewScrollbars>[0] & {
  ariaLabel: string
  onHorizontalVisibilityChange: (visible: boolean) => void
}

/** View previews update only this small subtree, never the canvas controller. */
export function CanvasViewScrollbars({ ariaLabel, onHorizontalVisibilityChange, ...options }: Props) {
  const { horizontal, vertical } = useCanvasViewScrollbars(options)
  useEffect(() => {
    onHorizontalVisibilityChange(horizontal.visible)
  }, [horizontal.visible, onHorizontalVisibilityChange])
  return <>
    {horizontal.visible && <Scrollbar
      className={`stage-view-scrollbar stage-view-scrollbar-horizontal${vertical.visible ? ' stage-view-scrollbar-with-corner' : ''}`}
      orientation="horizontal" value={horizontal.position} thumbRatio={horizontal.thumbRatio}
      ariaLabel={`${ariaLabel} X`} onChange={horizontal.onChange}
    />}
    {vertical.visible && <Scrollbar
      className={`stage-view-scrollbar stage-view-scrollbar-vertical${horizontal.visible ? ' stage-view-scrollbar-with-corner' : ''}`}
      orientation="vertical" value={vertical.position} thumbRatio={vertical.thumbRatio}
      ariaLabel={`${ariaLabel} Y`} onChange={vertical.onChange}
    />}

  </>
}
