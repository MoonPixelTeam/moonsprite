import { createContext, useCallback, useContext, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Tooltip } from './Tooltip'
import { PreferenceSearchContext, searchText } from './PreferenceSearchContext'

interface FormFieldProps {
  children: ReactNode
  className?: string
  hint?: ReactNode
  label: ReactNode
  layout?: 'stacked' | 'inline'
  tooltip?: ReactNode
}

export interface NumberScrubController {
  adjustByPixels(pixels: number, multiplier: number): boolean
  isDisabled(): boolean
}

type RegisterNumberScrubController = (controller: NumberScrubController) => () => void

export const NumberScrubContext = createContext<RegisterNumberScrubController | null>(null)

interface NumberScrubDrag {
  controller: NumberScrubController
  pointerId: number
  lastX: number
}

export function FormField({ children, className = '', hint, label, layout = 'stacked', tooltip }: FormFieldProps) {
  const search = useContext(PreferenceSearchContext)
  const searchUnmatched = Boolean(search?.query && !search.matches(label))
  const controllersRef = useRef(new Set<NumberScrubController>())
  const dragRef = useRef<NumberScrubDrag | null>(null)
  const [controller, setController] = useState<NumberScrubController | null>(null)
  const registerController = useCallback<RegisterNumberScrubController>((next) => {
    controllersRef.current.add(next)
    setController(controllersRef.current.size === 1 ? next : null)
    return () => {
      controllersRef.current.delete(next)
      setController(controllersRef.current.size === 1 ? [...controllersRef.current][0] : null)
      if (dragRef.current?.controller === next) dragRef.current = null
    }
  }, [])
  const beginScrub = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (event.button !== 0 || !controller || controller.isDisabled()) return
    dragRef.current = { controller, pointerId: event.pointerId, lastX: event.clientX }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }
  const updateScrub = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const pixels = event.clientX - drag.lastX
    if (pixels !== 0) {
      drag.controller.adjustByPixels(pixels, event.shiftKey ? 10 : 1)
      drag.lastX = event.clientX
    }
    event.preventDefault()
  }
  const endScrub = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const scrubbable = Boolean(controller && !controller.isDisabled())
  const copy = <span className="ui-field-label" data-number-scrubbable={scrubbable || undefined} onPointerDown={beginScrub} onPointerMove={updateScrub} onPointerUp={endScrub} onPointerCancel={endScrub}>{label}</span>
  return <NumberScrubContext.Provider value={registerController}>
    <div className={`ui-field ui-field-${layout} ${className} ${searchUnmatched ? 'search-unmatched' : ''}`.trim()} data-search-text={searchUnmatched ? searchText(label) : undefined}>
      {tooltip ? <Tooltip content={tooltip}>{copy}</Tooltip> : copy}
      <div className="ui-field-control">{children}</div>
      {hint && <small className="ui-field-hint">{hint}</small>}
    </div>
  </NumberScrubContext.Provider>
}
