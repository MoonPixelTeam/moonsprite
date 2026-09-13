import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { FreeTileInstance } from '@shared/types-tiles'
import type { RasterLayer } from '@shared/types-layer'
import type { RgbaColor } from '@shared/types-color'
import { FreeTileInstancePropertiesDialog } from '@/components/FreeTileInstancePropertiesDialog'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { Tooltip } from '@/components/Tooltip'
import { publishFreeTileInstanceFlash } from '@/components/free-tile-instance-events'
import { ensureAnimationDocument } from '@/core/animation'
import { freeTileInstanceBounds, freeTileSourceForInstance } from '@/core/free-tile'
import { freeTileCelTargetAt } from '@/core/free-tile-document'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { useLayerRowToggleGesture, type LayerRowToggleControl } from '@/components/panels/useLayerRowToggleGesture'
import { EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import type { ShortcutId } from '@/core/shortcuts'

interface FreeTileInstanceDrag {
  pointerId: number
  element: HTMLButtonElement
  instanceId: string
  startX: number
  startY: number
  moved: boolean
  targetId: string | null
  position: 'before' | 'after' | null
}

interface FreeTileInstanceEntry {
  instance: FreeTileInstance
  sourceName: string
  displayColor?: RgbaColor
  ordinal: number
  bounds: { x: number; y: number; width: number; height: number }
  opacity: number
  blendMode: NonNullable<FreeTileInstance['blendMode']>
}

interface FreeTileInstanceToggleTarget {
  control: LayerRowToggleControl
  id: string
}

interface FreeTileInstancePropertiesTarget {
  primaryId: string
  instanceIds: string[]
}

interface FreeTileInstanceLayersProps {
  session: DocumentSession
  layer: RasterLayer
  listRef: RefObject<HTMLDivElement | null>
}

export function FreeTileInstanceLayers({ session, layer, listRef }: FreeTileInstanceLayersProps) {
  const { t } = useI18n()
  const store = useWorkspace.getState()
  const timeline = ensureAnimationDocument(session.document)
  const activeFrameId = timeline.activeFrameId
  const target = freeTileCelTargetAt(session.document, layer.id, activeFrameId)
  const sourceOrdinals = new Map<string, number>()
  const entries: FreeTileInstanceEntry[] = target ? target.freeTiles.instances.flatMap((instance) => {
    const source = freeTileSourceForInstance(target.sources, instance)
    if (!source) return []
    const ordinal = (sourceOrdinals.get(source.id) ?? 0) + 1
    sourceOrdinals.set(source.id, ordinal)
    const sourceLayer = layer.freeTileSources?.find((candidate) => candidate.id === source.id)
    return [{
      instance,
      sourceName: sourceLayer?.name ?? source.tileset.name,
      displayColor: sourceLayer?.displayColor ? { ...sourceLayer.displayColor } : undefined,
      ordinal,
      bounds: freeTileInstanceBounds(instance, target.sources, target.surface.offsetX, target.surface.offsetY),
      opacity: instance.opacity ?? source.opacity,
      blendMode: instance.blendMode ?? source.blendMode
    }]
  }) : []
  const displayedEntries = [...entries].reverse()
  const displayedInstanceIds = displayedEntries.map(({ instance }) => instance.id)
  const activeInstanceIds = new Set(displayedInstanceIds)
  const selectedInstanceIds = session.selectedFreeTileInstanceIds.filter((id) => activeInstanceIds.has(id))
  if (session.selectedFreeTileInstanceId && activeInstanceIds.has(session.selectedFreeTileInstanceId) && !selectedInstanceIds.includes(session.selectedFreeTileInstanceId)) {
    selectedInstanceIds.push(session.selectedFreeTileInstanceId)
  }
  const selectedInstanceId = session.selectedFreeTileInstanceId && activeInstanceIds.has(session.selectedFreeTileInstanceId)
    ? session.selectedFreeTileInstanceId
    : null
  const selectedInstanceIdSet = new Set(selectedInstanceIds)
  const dragRef = useRef<FreeTileInstanceDrag | null>(null)
  const suppressRowClickRef = useRef(false)
  const rowFlashHandledRef = useRef(false)
  const shortcutCommandHandlerRef = useRef<(id: ShortcutId) => void>(() => {})
  const [contextMenu, setContextMenu] = useState<{ instanceId: string; x: number; y: number } | null>(null)
  const [properties, setProperties] = useState<FreeTileInstancePropertiesTarget | null>(null)
  const [drop, setDrop] = useState<{ instanceId: string; targetId: string; position: 'before' | 'after' } | null>(null)
  const toggleTargetKey = (toggleTarget: FreeTileInstanceToggleTarget): string => `${toggleTarget.control}:${toggleTarget.id}`
  const currentToggleInstance = (instanceId: string): FreeTileInstance | null => {
    const active = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session.document.id)
    if (!active) return null
    const activeTimeline = ensureAnimationDocument(active.document)
    return freeTileCelTargetAt(active.document, layer.id, activeTimeline.activeFrameId)?.freeTiles.instances.find((instance) => instance.id === instanceId) ?? null
  }
  const readToggleValue = (toggleTarget: FreeTileInstanceToggleTarget): boolean | null => {
    const instance = currentToggleInstance(toggleTarget.id)
    if (!instance) return null
    return toggleTarget.control === 'visibility' ? instance.visible !== false : instance.locked === true
  }
  const applyToggleValue = (toggleTarget: FreeTileInstanceToggleTarget, value: boolean): void => {
    const current = readToggleValue(toggleTarget)
    if (current === null || current === value) return
    store.setFreeTileInstanceProperties(toggleTarget.id, toggleTarget.control === 'visibility' ? { visible: value } : { locked: value }, false)
  }
  const visibleToggleTargets = (control: LayerRowToggleControl): FreeTileInstanceToggleTarget[] => displayedEntries.map(({ instance }) => ({ control, id: instance.id }))
  const toggleGesture = useLayerRowToggleGesture<FreeTileInstanceToggleTarget>({
    targetKey: toggleTargetKey,
    readValue: readToggleValue,
    applyValue: applyToggleValue,
    visibleTargets: visibleToggleTargets,
    altTargets: (toggleTarget) => visibleToggleTargets(toggleTarget.control),
    beginTransaction: () => store.beginLayerPanelTransaction(session.document.id),
    commitTransaction: (control) => store.commitLayerPanelTransaction(session.document.id, t(control === 'visibility' ? 'workspace.history.showLayer' : 'workspace.history.layerProperties'))
  })

  useEffect(() => {
    if (!session.selectedFreeTileInstanceId || selectedInstanceId) return
    store.setSelectedFreeTileInstance(null)
  }, [activeFrameId, layer.id, selectedInstanceId, session.selectedFreeTileInstanceId, store])

  useEffect(() => () => {
    const drag = dragRef.current
    if (drag?.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture?.(drag.pointerId)
    dragRef.current = null
  }, [activeFrameId, layer.id])

  useEffect(() => {
    if (!contextMenu) return
    const close = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest('.free-tile-instance-context-menu')) setContextMenu(null)
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [contextMenu])

  useEffect(() => {
    const handleShortcutCommand = (event: Event): void => {
      const detail = (event as CustomEvent<EditorShortcutCommandDetail>).detail
      if (!detail || detail.documentId !== session.document.id) return
      shortcutCommandHandlerRef.current(detail.id)
    }
    window.addEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
    return () => window.removeEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
  }, [session.document.id])

  const entryForId = (instanceId: string): FreeTileInstanceEntry | null => entries.find(({ instance }) => instance.id === instanceId) ?? null
  const activeInstanceForId = (instanceId: string): FreeTileInstance | null => entryForId(instanceId)?.instance ?? null
  const flashInstance = (instanceId: string): void => publishFreeTileInstanceFlash({ documentId: session.document.id, instanceId })
  const enterInstanceLayerView = (): void => {
    if (session.freeTileInstanceLayerId !== layer.id) store.setFreeTileInstanceLayerView(layer.id)
  }
  const selectSingleInstance = (instance: FreeTileInstance, edit = false, flash = true): void => {
    enterInstanceLayerView()
    store.setSelectedFreeTileInstance(instance.id, edit ? 'edit' : undefined)
    if (flash) flashInstance(instance.id)
  }
  const selectInstanceRow = (instance: FreeTileInstance, mode: 'replace' | 'toggle' | 'range' = 'replace'): void => {
    enterInstanceLayerView()
    store.selectFreeTileInstanceRow(instance.id, mode, displayedInstanceIds)
    flashInstance(instance.id)
  }
  const openProperties = (instanceId: string): void => {
    const instance = activeInstanceForId(instanceId)
    if (!instance) return
    const active = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session.document.id)
    const activeTarget = active ? freeTileCelTargetAt(active.document, layer.id, ensureAnimationDocument(active.document).activeFrameId) : null
    const validIds = new Set(activeTarget?.freeTiles.instances.map((candidate) => candidate.id) ?? [])
    const currentIds = active?.selectedFreeTileInstanceIds.filter((id) => validIds.has(id)) ?? []
    const instanceIds = currentIds.includes(instanceId) ? currentIds : [instanceId]
    if (!currentIds.includes(instanceId)) selectInstanceRow(instance)
    setContextMenu(null)
    setProperties({ primaryId: instanceId, instanceIds })
  }
  const deleteInstances = (instance: FreeTileInstance): void => {
    const instanceIds = selectedInstanceIdSet.has(instance.id) ? selectedInstanceIds : [instance.id]
    if (store.deleteFreeTileInstances(instanceIds)) setContextMenu(null)
  }
  const showOnlyInstance = (instance: FreeTileInstance): void => {
    store.showOnlyFreeTileInstance(instance.id)
    setContextMenu(null)
  }
  const transformInstance = (instance: FreeTileInstance, changes: Pick<FreeTileInstance, 'rotation' | 'flipHorizontal' | 'flipVertical'>): void => {
    if (instance.locked === true) return
    store.setFreeTileInstanceProperties(instance.id, changes)
    setContextMenu(null)
  }
  const rowAt = (clientY: number): { targetId: string; position: 'before' | 'after' } | null => {
    const list = listRef.current
    if (!list || displayedEntries.length === 0) return null
    const rows = Array.from(list.querySelectorAll<HTMLButtonElement>('[data-free-tile-instance-active="true"]'))
    if (rows.length === 0) return null
    const first = rows[0].getBoundingClientRect()
    const last = rows.at(-1)!.getBoundingClientRect()
    if (clientY < first.top) return { targetId: rows[0].dataset.freeTileInstanceId!, position: 'before' }
    if (clientY > last.bottom) return { targetId: rows.at(-1)!.dataset.freeTileInstanceId!, position: 'after' }
    const row = rows.find((candidate) => {
      const bounds = candidate.getBoundingClientRect()
      return clientY >= bounds.top && clientY <= bounds.bottom
    }) ?? rows.reduce((nearest, candidate) => {
      const nearestBounds = nearest.getBoundingClientRect()
      const candidateBounds = candidate.getBoundingClientRect()
      return Math.abs(clientY - (candidateBounds.top + candidateBounds.height / 2)) < Math.abs(clientY - (nearestBounds.top + nearestBounds.height / 2)) ? candidate : nearest
    })
    const bounds = row.getBoundingClientRect()
    return { targetId: row.dataset.freeTileInstanceId!, position: clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' }
  }
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, instance: FreeTileInstance): void => {
    if (event.button !== 0) return
    suppressRowClickRef.current = false
    rowFlashHandledRef.current = false
    if (event.ctrlKey) {
      suppressRowClickRef.current = true
      selectInstanceRow(instance, 'toggle')
      rowFlashHandledRef.current = true
      return
    }
    if (event.shiftKey) {
      suppressRowClickRef.current = true
      selectInstanceRow(instance, 'range')
      rowFlashHandledRef.current = true
      return
    }
    if (!selectedInstanceIdSet.has(instance.id)) {
      selectInstanceRow(instance)
      rowFlashHandledRef.current = true
    }
    if (instance.locked === true) return
    const element = event.currentTarget
    dragRef.current = { pointerId: event.pointerId, element, instanceId: instance.id, startX: event.clientX, startY: event.clientY, moved: false, targetId: null, position: null }
    element.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    drag.moved = true
    const dropTarget = rowAt(event.clientY)
    drag.targetId = dropTarget?.targetId ?? null
    drag.position = dropTarget?.position ?? null
    setDrop(dropTarget && dropTarget.targetId !== drag.instanceId ? { instanceId: drag.instanceId, targetId: dropTarget.targetId, position: dropTarget.position } : null)
    event.preventDefault()
  }
  const finishDrag = (pointerId: number, cancel = false): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    dragRef.current = null
    suppressRowClickRef.current = drag.moved || cancel
    if (drag.element.hasPointerCapture?.(pointerId)) drag.element.releasePointerCapture?.(pointerId)
    const targetId = drag.targetId
    const position = drag.position
    setDrop(null)
    if (!cancel && drag.moved && targetId && position && targetId !== drag.instanceId) store.reorderFreeTileInstance(drag.instanceId, targetId, position)
  }
  const selectRowFromClick = (instance: FreeTileInstance): void => {
    if (suppressRowClickRef.current) {
      suppressRowClickRef.current = false
      rowFlashHandledRef.current = false
      return
    }
    if (rowFlashHandledRef.current) {
      rowFlashHandledRef.current = false
      return
    }
    const active = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === session.document.id)
    const currentIds = active?.selectedFreeTileInstanceIds ?? []
    if (currentIds.length === 1 && currentIds[0] === instance.id) {
      flashInstance(instance.id)
      return
    }
    selectInstanceRow(instance)
  }
  const stopRowPointer = (event: ReactPointerEvent<HTMLElement>): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  const propertiesEntry = properties ? entryForId(properties.primaryId) : null
  const propertyInstanceIds = properties?.instanceIds ?? []
  const contextEntry = contextMenu ? entryForId(contextMenu.instanceId) : null
  const contextInstanceIds = contextEntry && selectedInstanceIdSet.has(contextEntry.instance.id) ? selectedInstanceIds : contextEntry ? [contextEntry.instance.id] : []
  const contextDeleteDisabled = contextInstanceIds.some((instanceId) => activeInstanceForId(instanceId)?.locked === true)
  const shortcutEntry = entryForId(selectedInstanceId ?? selectedInstanceIds[0] ?? '')

  shortcutCommandHandlerRef.current = (id): void => {
    if (!shortcutEntry) return
    switch (id) {
      case 'showOnlyFreeTileInstance': showOnlyInstance(shortcutEntry.instance); break
      case 'openFreeTileInstanceProperties': openProperties(shortcutEntry.instance.id); break
      case 'rotateFreeTileInstance90': transformInstance(shortcutEntry.instance, { rotation: (((shortcutEntry.instance.rotation ?? 0) + 1) % 4) as 0 | 1 | 2 | 3 }); break
      case 'mirrorFreeTileInstanceHorizontal': transformInstance(shortcutEntry.instance, { flipHorizontal: shortcutEntry.instance.flipHorizontal !== true }); break
      case 'mirrorFreeTileInstanceVertical': transformInstance(shortcutEntry.instance, { flipVertical: shortcutEntry.instance.flipVertical !== true }); break
      case 'deleteFreeTileInstances': deleteInstances(shortcutEntry.instance); break
    }
  }

  return <>
    <div ref={listRef} className="layer-list free-tile-instance-layer-view component-scrollbar" role="listbox" aria-label={t('freeTiles.instances')} aria-multiselectable="true">
      {displayedEntries.length > 0 ? displayedEntries.map((entry, entryIndex) => {
        const { instance, sourceName, displayColor, ordinal, bounds } = entry
        const instanceId = instance.id
        const selected = selectedInstanceIdSet.has(instanceId)
        const selectedBefore = selected && entryIndex > 0 && selectedInstanceIdSet.has(displayedEntries[entryIndex - 1].instance.id)
        const selectedAfter = selected && entryIndex + 1 < displayedEntries.length && selectedInstanceIdSet.has(displayedEntries[entryIndex + 1].instance.id)
        const dragging = drop?.instanceId === instanceId
        const dropTarget = drop?.targetId === instanceId
        const name = t('freeTiles.instanceName', { name: sourceName, index: ordinal })
        return <button key={instanceId} type="button" data-free-tile-instance-id={instanceId} data-free-tile-instance-active="true" className={`layer-row free-tile-instance-row ${selected ? 'selected' : ''} ${selected && !selectedBefore ? 'selection-first' : ''} ${selected && !selectedAfter ? 'selection-last' : ''} ${dragging ? 'dragging' : ''}`} role="option" aria-label={name} aria-selected={selected} aria-grabbed={dragging} onPointerDown={(event) => beginDrag(event, instance)} onPointerMove={moveDrag} onPointerUp={(event) => finishDrag(event.pointerId)} onPointerCancel={(event) => finishDrag(event.pointerId, true)} onClick={() => selectRowFromClick(instance)} onDoubleClick={() => { if (instance.locked !== true) selectSingleInstance(instance, true, false) }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!selectedInstanceIdSet.has(instanceId)) selectInstanceRow(instance); setContextMenu({ instanceId, x: event.clientX, y: event.clientY }) }} onKeyDown={(event) => { if (event.key !== 'Delete' && event.key !== 'Backspace') return; event.preventDefault(); event.stopPropagation(); deleteInstances(instance) }}>
          {dropTarget && <span className={`layer-drop-indicator ${drop.position === 'before' ? 'above' : 'below'}`} aria-hidden="true"><i /><b /><i /></span>}
          {displayColor && <span className="layer-color-stripe" style={{ backgroundColor: `rgba(${displayColor.r}, ${displayColor.g}, ${displayColor.b}, ${displayColor.a / 255})` }} aria-hidden="true" />}
          <span className="layer-visibility" role="button" tabIndex={-1} aria-label={t(instance.visible === false ? 'layers.showLayer' : 'layers.hideLayer')} onPointerDown={(event) => toggleGesture.begin(event, { control: 'visibility', id: instance.id }, instance.visible !== false)} onPointerEnter={(event) => toggleGesture.enter(event, { control: 'visibility', id: instance.id })} onPointerUp={toggleGesture.end} onPointerCancel={toggleGesture.end} onDoubleClick={(event) => event.stopPropagation()} onClick={toggleGesture.click}>{instance.visible === false ? <PixelUtilityIcon kind="eyeOff" /> : <PixelUtilityIcon kind="eye" />}</span>
          <span className={`layer-lock-toggle ${instance.locked === true ? 'locked' : ''}`} role="button" tabIndex={-1} aria-label={t(instance.locked === true ? 'layers.unlockLayer' : 'layers.lockLayer')} aria-pressed={instance.locked === true} onPointerDown={(event) => toggleGesture.begin(event, { control: 'lock', id: instance.id }, instance.locked === true)} onPointerEnter={(event) => toggleGesture.enter(event, { control: 'lock', id: instance.id })} onPointerUp={toggleGesture.end} onPointerCancel={toggleGesture.end} onDoubleClick={(event) => event.stopPropagation()} onClick={toggleGesture.click}>{instance.locked === true ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</span>
          <span className="layer-name"><span>{name}</span><small>{t('freeTiles.instancePosition', { x: bounds.x, y: bounds.y })}</small></span>
          <Tooltip className="layer-status-icon-tooltip" content={t('freeTiles.instanceProperties')}><span className="layer-instance-properties" role="button" tabIndex={0} aria-label={t('freeTiles.instanceProperties')} onPointerDown={stopRowPointer} onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openProperties(instanceId) }} onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); event.stopPropagation(); openProperties(instanceId) }}><PixelUtilityIcon kind="properties" /></span></Tooltip>
        </button>
      }) : <div className="free-tile-instance-empty">{t('freeTiles.noInstances')}</div>}
    </div>
    {contextMenu && contextEntry && createPortal(<div className="context-menu free-tile-instance-context-menu" role="menu" aria-label={t('freeTiles.instanceProperties')} style={{ left: Math.min(contextMenu.x, Math.max(8, window.innerWidth - 238)), top: Math.min(contextMenu.y, Math.max(8, window.innerHeight - 254)) }} onContextMenu={(event) => event.preventDefault()}>
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => showOnlyInstance(contextEntry.instance)}><PixelUtilityIcon kind="eye" /><span>{t('freeTiles.showOnlyInstance')}</span></button>
      <button className="context-menu-item" type="button" role="menuitem" onClick={() => openProperties(contextMenu.instanceId)}><PixelUtilityIcon kind="properties" /><span>{t('freeTiles.instanceProperties')}</span></button>
      <span className="context-menu-divider" />
      <button className="context-menu-item" type="button" role="menuitem" disabled={contextEntry.instance.locked === true} onClick={() => transformInstance(contextEntry.instance, { rotation: (((contextEntry.instance.rotation ?? 0) + 1) % 4) as 0 | 1 | 2 | 3 })}><PixelUtilityIcon kind="rotateClockwise90" /><span>{t('freeTiles.instanceRotate90')}</span></button>
      <button className="context-menu-item" type="button" role="menuitem" disabled={contextEntry.instance.locked === true} onClick={() => transformInstance(contextEntry.instance, { flipHorizontal: contextEntry.instance.flipHorizontal !== true })}><PixelUtilityIcon kind="selectionFlipHorizontal" /><span>{t('freeTiles.instanceMirrorHorizontal')}</span></button>
      <button className="context-menu-item" type="button" role="menuitem" disabled={contextEntry.instance.locked === true} onClick={() => transformInstance(contextEntry.instance, { flipVertical: contextEntry.instance.flipVertical !== true })}><PixelUtilityIcon kind="selectionFlipVertical" /><span>{t('freeTiles.instanceMirrorVertical')}</span></button>
      <span className="context-menu-divider" />
      <button className="context-menu-item danger" type="button" role="menuitem" disabled={contextDeleteDisabled} onClick={() => deleteInstances(contextEntry.instance)}><PixelUtilityIcon kind="delete" /><span>{t(contextInstanceIds.length > 1 ? 'freeTiles.deleteSelectedInstances' : 'freeTiles.deleteInstance')}</span></button>
    </div>, document.body)}
    {propertiesEntry && propertyInstanceIds.length > 0 && <FreeTileInstancePropertiesDialog instanceIds={propertyInstanceIds} name={propertiesEntry.sourceName} x={propertiesEntry.bounds.x} y={propertiesEntry.bounds.y} opacity={propertiesEntry.opacity} blendMode={propertiesEntry.blendMode} rotation={propertiesEntry.instance.rotation ?? 0} flipHorizontal={propertiesEntry.instance.flipHorizontal === true} flipVertical={propertiesEntry.instance.flipVertical === true} locked={propertyInstanceIds.length === 1 && propertiesEntry.instance.locked === true} onClose={() => setProperties(null)} />}
  </>
}
