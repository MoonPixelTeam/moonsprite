import { createElement, useLayoutEffect, useMemo, type FocusEvent as ReactFocusEvent, type FormEventHandler, type HTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { PortalResizeHandles, useFloatingPanel, useFloatingWindowStack } from './floating-panel'

type ModalPlacement = 'center' | 'right' | 'stage-top-left'

const COMPACT_DEFAULT_WIDTH_RATIO = 0.88
const COMPACT_DEFAULT_HEIGHT_RATIO = 0.82

function compactDefaultDimension(value: number, minimum: number, ratio: number) {
  return Math.max(minimum, Math.round(value * ratio))
}

interface ModalShellProps extends Omit<HTMLAttributes<HTMLElement>, 'onSubmit'> {
  as?: 'section' | 'form'
  children: ReactNode
  className?: string
  defaultHeight?: number
  defaultWidth?: number
  fitContent?: boolean
  fitContentKey?: string
  minHeight?: number
  minWidth?: number
  maxHeight?: number
  maxWidth?: number
  onSubmit?: FormEventHandler<HTMLFormElement>
  placement?: ModalPlacement
  resizable?: boolean
  resizePortalClassName?: string
  storageKey: string
}

function initialModalPosition(width: number, height: number, placement: ModalPlacement, fitContent: boolean) {
  const margin = 12
  const viewportTop = document.querySelector<HTMLElement>('.app-window-titlebar')?.getBoundingClientRect().bottom ?? 0
  const safeWidth = Math.min(width, window.innerWidth - margin * 2)
  const availableHeight = Math.max(1, window.innerHeight - viewportTop)
  const safeHeight = Math.min(height, Math.max(1, availableHeight - margin * 2))
  const stage = placement === 'center' ? null : document.querySelector<HTMLElement>('.stage-wrap')?.getBoundingClientRect()
  if (placement === 'stage-top-left') {
    const targetX = stage && stage.width > 0 ? stage.left + margin : margin
    const targetY = stage && stage.height > 0 ? stage.top + margin : viewportTop + margin
    return {
      x: Math.max(margin, Math.min(window.innerWidth - safeWidth - margin, Math.round(targetX))),
      y: Math.max(viewportTop + margin, Math.min(window.innerHeight - safeHeight - margin, Math.round(targetY))),
      width: safeWidth,
      height: fitContent ? undefined : safeHeight
    }
  }
  const targetCenterX = stage && stage.width > 0 ? stage.left + stage.width * 0.75 : window.innerWidth * 0.75
  const x = placement === 'right'
    ? Math.max(margin, Math.min(window.innerWidth - safeWidth - margin, Math.round(targetCenterX - safeWidth / 2)))
    : Math.max(margin, Math.round((window.innerWidth - safeWidth) / 2))
  return {
    x,
    y: viewportTop + Math.max(margin, Math.round((availableHeight - safeHeight) / 2)),
    width: safeWidth,
    height: fitContent ? undefined : safeHeight
  }
}

export function ModalShell({
  as = 'section',
  children,
  className = '',
  defaultHeight = 360,
  defaultWidth = 420,
  fitContent = true,
  fitContentKey,
  minHeight = 220,
  minWidth = 300,
  maxHeight = 760,
  maxWidth = 820,
  onFocusCapture,
  onPointerDown,
  placement = 'center',
  resizable = true,
  resizePortalClassName,
  storageKey,
  ...props
}: ModalShellProps): ReactElement {
  const classNames = new Set(className.split(/\s+/).filter(Boolean))
  const fullSettingsDialog = classNames.has('settings-modal')
  const effectiveFitContent = fullSettingsDialog ? false : fitContent
  const layoutMinWidth = fullSettingsDialog ? Math.max(minWidth, 620)
    : classNames.has('component-library') ? Math.max(minWidth, 700)
      : classNames.has('outline-modal') ? Math.max(minWidth, 390)
        : minWidth
  const layoutMinHeight = fullSettingsDialog ? Math.max(minHeight, 440)
    : classNames.has('component-library') ? Math.max(minHeight, 500)
      : classNames.has('outline-modal') ? Math.max(minHeight, 340)
        : minHeight
  const viewportTop = document.querySelector<HTMLElement>('.app-window-titlebar')?.getBoundingClientRect().bottom ?? 0
  const viewportMaxWidth = Math.min(maxWidth, Math.max(1, window.innerWidth - 24))
  const viewportMaxHeight = Math.min(maxHeight, Math.max(1, window.innerHeight - viewportTop - 24))
  const viewportMinWidth = Math.min(layoutMinWidth, Math.max(1, window.innerWidth - 12))
  const viewportMinHeight = Math.min(layoutMinHeight, viewportMaxHeight)
  const compactDefaultWidth = compactDefaultDimension(defaultWidth, layoutMinWidth, COMPACT_DEFAULT_WIDTH_RATIO)
  const compactDefaultHeight = effectiveFitContent
    ? defaultHeight
    : compactDefaultDimension(defaultHeight, layoutMinHeight, COMPACT_DEFAULT_HEIGHT_RATIO)
  const initialPosition = useMemo(
    () => initialModalPosition(compactDefaultWidth, compactDefaultHeight, placement, effectiveFitContent),
    [compactDefaultHeight, compactDefaultWidth, effectiveFitContent, placement]
  )
  const floating = useFloatingPanel(
    initialPosition,
    placement === 'right',
    false,
    `moonsprite.modal.${storageKey}`,
    true,
    undefined,
    false,
    { minWidth: layoutMinWidth, minHeight: layoutMinHeight, maxWidth, maxHeight }
  )
  const windowStack = useFloatingWindowStack(floating.ref)
  useLayoutEffect(() => {
    if (effectiveFitContent && fitContentKey !== undefined) floating.clearHeight()
  }, [effectiveFitContent, fitContentKey])

  const modalStyle = {
    ...floating.style,
    top: typeof floating.style?.top === 'number' ? Math.max(viewportTop + 6, floating.style.top) : floating.style?.top,
    minWidth: viewportMinWidth,
    minHeight: viewportMinHeight,
    maxWidth: viewportMaxWidth,
    maxHeight: viewportMaxHeight,
    overflow: 'hidden',
    zIndex: windowStack.zIndex
  }

  return createElement(as, {
    ...props,
    ref: floating.ref,
    className: `modal resizable-modal ${placement === 'right' ? 'right-modal' : ''} ${className}`.trim(),
    style: modalStyle,
    onFocusCapture: (event: ReactFocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.target as Node)) return
      // Form controls are already inside the active modal. Raising the whole
      // floating stack while a button is focused can synchronously rewrite the
      // modal's z-index during the native press gesture. Chromium may then
      // briefly paint the old composited layer as a dark strip outside the
      // dialog. Only non-control focus should change the window order.
      const target = event.target as HTMLElement
      const isInteractive = Boolean(target.closest('button, input, select, textarea, [role="button"], [contenteditable="true"]'))
      if (!isInteractive) windowStack.bringToFront()
      onFocusCapture?.(event)
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.target as Node)) return
      const target = event.target as HTMLElement
      const isInteractive = Boolean(target.closest('button, input, select, textarea, [role="button"], [contenteditable="true"]'))
      if (!isInteractive) windowStack.bringToFront()
      const header = target.closest('header')
      if (header && event.currentTarget.contains(header) && header.closest('.modal') === event.currentTarget) floating.startDrag(event)
      onPointerDown?.(event)
    }
  }, children, resizable
    ? createElement(PortalResizeHandles, { targetRef: floating.ref, position: modalStyle, onResize: (event, direction) => { windowStack.bringToFront(); floating.startResize(event, direction) }, className: resizePortalClassName })
    : null)
}
