import { documentPaneDockDirection, documentPaneDockDirectionAlongPath, type DocumentPaneDirection, type DocumentPanePointerPoint, type DocumentPaneRect } from '@/core/document-pane-layout'

export interface DocumentPanePointHit {
  pointed: Element | null
  pane: HTMLElement | null
}

export interface DocumentPaneDockTarget {
  paneId: string
  rect: DocumentPaneRect
}

interface PanePointHitOptions {
  excludePaneId?: string
  outerSlop?: number
}

interface PaneDockHitOptions extends PanePointHitOptions {
  currentTarget?: DocumentPaneDockTarget | null
  previousPoint?: DocumentPanePointerPoint | null
  strictPoint?: boolean
  targets?: readonly DocumentPaneDockTarget[]
}

export interface DocumentPaneDockHit extends DocumentPanePointHit {
  target: DocumentPaneDockTarget | null
  direction: DocumentPaneDirection | null
}

export const documentPaneElementRect = (element: HTMLElement): DocumentPaneRect => {
  const rect = element.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
}

const paneDistance = (element: HTMLElement, clientX: number, clientY: number): number => {
  const rect = element.getBoundingClientRect()
  const horizontal = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0
  const vertical = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
  // A square hit band keeps a diagonal approach to a corner valid when both
  // axes are still inside the docking tolerance.
  return Math.max(horizontal, vertical)
}

const containsPoint = (element: HTMLElement, clientX: number, clientY: number): boolean => {
  const rect = element.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

const targetContainsPoint = (target: DocumentPaneDockTarget, clientX: number, clientY: number): boolean =>
  clientX >= target.rect.left && clientX <= target.rect.right && clientY >= target.rect.top && clientY <= target.rect.bottom

const paneElementById = (paneId: string): HTMLElement | null =>
  [...document.querySelectorAll<HTMLElement>('[data-document-pane-id]')]
    .find((candidate) => candidate.dataset.documentPaneId === paneId && candidate.dataset.documentPanePreview !== 'true') ?? null

const paneCandidates = (options: PanePointHitOptions): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('[data-document-pane-id]')]
    .filter((candidate) => candidate.dataset.documentPaneId !== options.excludePaneId && candidate.dataset.documentPanePreview !== 'true')

export const captureDocumentPaneDockTargets = (options: PanePointHitOptions = {}): DocumentPaneDockTarget[] =>
  paneCandidates(options).flatMap((pane) => {
    const paneId = pane.dataset.documentPaneId
    if (!paneId) return []
    const rect = documentPaneElementRect(pane)
    return rect.width > 0 && rect.height > 0 ? [{ paneId, rect }] : []
  })

const resolvePaneElement = (pointed: Element | null, clientX: number, clientY: number, options: PanePointHitOptions): HTMLElement | null => {
  const candidates = paneCandidates(options)

  const direct = pointed?.closest<HTMLElement>('[data-document-pane-id]') ?? null
  if (direct && direct.dataset.documentPaneId !== options.excludePaneId && containsPoint(direct, clientX, clientY)) {
    return direct
  }

  const outerSlop = options.outerSlop ?? 18
  let nearest: HTMLElement | null = null
  let nearestDistance = outerSlop
  for (const candidate of candidates) {
    const distance = paneDistance(candidate, clientX, clientY)
    if (distance <= nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return nearest
}

const resolvePaneElementStrict = (pointed: Element | null, clientX: number, clientY: number, options: PanePointHitOptions): HTMLElement | null => {
  const direct = pointed?.closest<HTMLElement>('[data-document-pane-id]') ?? null
  if (direct && direct.dataset.documentPaneId !== options.excludePaneId && direct.dataset.documentPanePreview !== 'true' && containsPoint(direct, clientX, clientY)) return direct
  return paneCandidates(options).find((candidate) => containsPoint(candidate, clientX, clientY)) ?? null
}

const resolvePaneElementAlongPath = (from: DocumentPanePointerPoint, to: DocumentPanePointerPoint, options: PanePointHitOptions): HTMLElement | null => {
  let nearest: HTMLElement | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const candidate of paneCandidates(options)) {
    const rect = documentPaneElementRect(candidate)
    if (!documentPaneDockDirectionAlongPath(rect, from, to)) continue
    const distance = paneDistance(candidate, to.x, to.y)
    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }
  return nearest
}

export const paneElementAtPoint = (clientX: number, clientY: number, options: PanePointHitOptions = {}): DocumentPanePointHit => {
  const pointed = document.elementFromPoint(clientX, clientY)
  return { pointed, pane: resolvePaneElement(pointed, clientX, clientY, options) }
}

export const paneDockTargetAtPoint = (clientX: number, clientY: number, options: PaneDockHitOptions = {}): DocumentPaneDockHit => {
  const pointed = document.elementFromPoint(clientX, clientY)
  if (options.targets) {
    const candidates = options.currentTarget
      ? [options.currentTarget, ...options.targets.filter((target) => target.paneId !== options.currentTarget?.paneId)]
      : options.targets
    const target = candidates.find((candidate) => targetContainsPoint(candidate, clientX, clientY)) ?? null
    return {
      pointed,
      pane: target ? paneElementById(target.paneId) : null,
      target,
      direction: target ? documentPaneDockDirection(target.rect, clientX, clientY) : null
    }
  }

  if (options.currentTarget && targetContainsPoint(options.currentTarget, clientX, clientY)) {
    const pane = paneElementById(options.currentTarget.paneId)
    return { pointed, pane, target: options.currentTarget, direction: documentPaneDockDirection(options.currentTarget.rect, clientX, clientY) }
  }

  const pane = options.strictPoint
    ? resolvePaneElementStrict(pointed, clientX, clientY, options)
    : resolvePaneElement(pointed, clientX, clientY, options)
      ?? (options.previousPoint ? resolvePaneElementAlongPath(options.previousPoint, { x: clientX, y: clientY }, options) : null)
  const paneId = pane?.dataset.documentPaneId
  if (!pane || !paneId) return { pointed, pane, target: null, direction: null }
  const target = { paneId, rect: documentPaneElementRect(pane) }
  const direction = documentPaneDockDirection(target.rect, clientX, clientY)
    ?? (!options.strictPoint && options.previousPoint ? documentPaneDockDirectionAlongPath(target.rect, options.previousPoint, { x: clientX, y: clientY }) : null)
  return { pointed, pane, target, direction }
}
