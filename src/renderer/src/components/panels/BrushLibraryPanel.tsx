import { pixelSource } from '@/components/pixel-source'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { BrushThumbnail } from '@/components/BrushThumbnail'
import { DialogHeader } from '@/components/DialogHeader'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { FormField } from '@/components/FormField'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { TextInput } from '@/components/TextInput'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { BRUSH_LIBRARY_DELETE_COMMAND_EVENT, EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import { brushLibraryLocation } from '@/core/brush-library-location'
import { brushFolderParentId } from '@/core/brush-folder-tree'
import { PALETTE_SWATCH_PIXELS, type PaletteSwatchSize } from '@/core/palette-layout'
import { readStoredString, writeStoredString } from '@/core/panel-preferences'
import type { BrushLibraryController, LoadedBrush } from '@/components/app/useBrushLibrary'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import type { StoredBrushFolder } from '@shared/types-library'
import type { ShortcutId } from '@/core/shortcuts'

const BRUSH_SWATCH_SIZE_STORAGE_KEY = 'moonsprite.brush-swatch-size'
type BrushSwatchSize = Extract<PaletteSwatchSize, 'small' | 'medium' | 'large'>
const BRUSH_SWATCH_SIZE_ORDER: BrushSwatchSize[] = ['small', 'medium', 'large']
const BRUSH_SWATCH_SIZE_LABEL_KEYS: Record<BrushSwatchSize, 'palette.size.small' | 'palette.size.medium' | 'palette.size.large'> = {
  small: 'palette.size.small',
  medium: 'palette.size.medium',
  large: 'palette.size.large'
} as const

type FolderId = string | null

interface BrushDragState {
  pointerId: number
  startX: number
  startY: number
  baseIds: string[]
  movingIds: string[]
  previewIds: string[]
  sourceFolderId: FolderId
  dropFolderId: FolderId
  moved: boolean
  element: HTMLButtonElement
  brush: LoadedBrush['brush']
  pointerOffsetX: number
  pointerOffsetY: number
  width: number
  height: number
}

interface BrushDragPreview {
  brush: LoadedBrush['brush']
  count: number
  left: number
  top: number
  width: number
  height: number
}

interface BrushFolderContextMenu {
  folderId: string
  x: number
  y: number
}

const folderKey = (folderId: FolderId): string => folderId ?? ''
const normalizeFolderId = (folderId: string | null | undefined): FolderId => folderId || null
const moveBrushIds = (baseIds: readonly string[], movingIds: readonly string[], targetId: string, insertAfter: boolean): string[] => {
  const moving = new Set(movingIds)
  const remaining = baseIds.filter((id) => !moving.has(id))
  const targetIndex = remaining.indexOf(targetId)
  if (targetIndex < 0) return [...baseIds]
  remaining.splice(targetIndex + (insertAfter ? 1 : 0), 0, ...baseIds.filter((id) => moving.has(id)))
  return remaining
}

export function BrushLibraryPanel({ session, controller, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: {
  session: DocumentSession
  controller: BrushLibraryController
} & DockDragProps) {
  const { t } = useI18n()
  const workspace = useWorkspace.getState()
  const defaultPosition = { x: Math.max(8, window.innerWidth - 390), y: 96, width: 360, height: 460 }
  const floating = useFloatingPanel(docked ? null : defaultPosition, false, true, 'moonsprite.brushes-panel.v1', true, onFloatingDock, docked)
  const contentRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const addPopoverRef = useRef<HTMLDivElement>(null)
  const manageButtonRef = useRef<HTMLButtonElement>(null)
  const managePopoverRef = useRef<HTMLDivElement>(null)
  const folderContextRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<BrushDragState | null>(null)
  const suppressClickRef = useRef(false)
  const shortcutCommandHandlerRef = useRef<(id: ShortcutId) => void>(() => {})
  const currentFolderId = useSyncExternalStore(brushLibraryLocation.subscribe, brushLibraryLocation.getSnapshot, brushLibraryLocation.getSnapshot)
  const [selectedIds, setSelectedIds] = useState<string[]>(() => session.brushImageId ? [session.brushImageId] : [])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [previewLocalIds, setPreviewLocalIds] = useState<string[] | null>(null)
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [dragPreview, setDragPreview] = useState<BrushDragPreview | null>(null)
  const [dropFolderKey, setDropFolderKey] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addPosition, setAddPosition] = useState({ left: 8, top: 8 })
  const [manageOpen, setManageOpen] = useState(false)
  const [managePosition, setManagePosition] = useState({ left: 8, top: 8 })
  const [folderContext, setFolderContext] = useState<BrushFolderContextMenu | null>(null)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [folderDialogMode, setFolderDialogMode] = useState<'create' | 'rename'>('create')
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [folderBusy, setFolderBusy] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [swatchSize, setSwatchSize] = useState<BrushSwatchSize>(() => {
    const stored = readStoredString(BRUSH_SWATCH_SIZE_STORAGE_KEY)
    return BRUSH_SWATCH_SIZE_ORDER.includes(stored as BrushSwatchSize) ? stored as BrushSwatchSize : 'small'
  })

  const localById = useMemo(() => new Map(controller.localBrushes.flatMap((item) => item.stored ? [[item.stored.id, item] as const] : [])), [controller.localBrushes])
  const displayedLocalBrushes = useMemo(() => {
    if (!previewLocalIds) return controller.localBrushes
    return previewLocalIds.flatMap((id) => {
      const item = localById.get(id)
      return item ? [item] : []
    })
  }, [controller.localBrushes, localById, previewLocalIds])
  const displayedBrushes = useMemo(() => {
    const local = displayedLocalBrushes.filter((item) => normalizeFolderId(item.stored?.folderId) === currentFolderId)
    return currentFolderId === null ? [...local, ...controller.projectBrushes] : local
  }, [controller.projectBrushes, currentFolderId, displayedLocalBrushes])
  const selectedBrushes = useMemo(() => displayedBrushes.filter((item) => selectedIds.includes(item.brush.id)), [displayedBrushes, selectedIds])
  const currentFolder = useMemo(() => controller.folders.find((folder) => folder.id === currentFolderId) ?? null, [controller.folders, currentFolderId])
  const currentParentFolderId = brushFolderParentId(currentFolderId)
  const visibleFolders = useMemo(() => controller.folders.filter((folder) => brushFolderParentId(folder.id) === currentFolderId), [controller.folders, currentFolderId])

  useEffect(() => {
    const valid = new Set(controller.brushes.map((item) => item.brush.id))
    setSelectedIds((current) => {
      const retained = current.filter((id) => valid.has(id))
      if (!session.brushImageId) return []
      return retained.includes(session.brushImageId) ? retained : [session.brushImageId]
    })
  }, [controller.brushes, session.brushImageId, session.document.id])

  useEffect(() => {
    if (currentFolderId && !controller.folders.some((folder) => folder.id === currentFolderId)) brushLibraryLocation.set(null)
  }, [controller.folders, currentFolderId])

  useEffect(() => {
    const panel = floating.ref.current
    if (!panel) return
    const handleDelete = (): void => { void controller.deleteBrushes(selectedBrushes) }
    panel.addEventListener(BRUSH_LIBRARY_DELETE_COMMAND_EVENT, handleDelete)
    return () => panel.removeEventListener(BRUSH_LIBRARY_DELETE_COMMAND_EVENT, handleDelete)
  }, [controller, floating.ref, selectedBrushes])

  useEffect(() => {
    const handleShortcutCommand = (event: Event): void => {
      const detail = (event as CustomEvent<EditorShortcutCommandDetail>).detail
      if (!detail || detail.documentId !== session.document.id) return
      shortcutCommandHandlerRef.current(detail.id)
    }
    window.addEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
    return () => window.removeEventListener(EDITOR_SHORTCUT_COMMAND_EVENT, handleShortcutCommand)
  }, [session.document.id])

  useEffect(() => {
    if (!addOpen && !manageOpen && !folderContext) return
    const dismiss = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!addButtonRef.current?.contains(target) && !addPopoverRef.current?.contains(target)) setAddOpen(false)
      if (!manageButtonRef.current?.contains(target) && !managePopoverRef.current?.contains(target)) setManageOpen(false)
      if (!folderContextRef.current?.contains(target)) setFolderContext(null)
    }
    window.addEventListener('pointerdown', dismiss, true)
    return () => window.removeEventListener('pointerdown', dismiss, true)
  }, [addOpen, folderContext, manageOpen])

  useLayoutEffect(() => {
    if (!addOpen && !manageOpen) return
    const place = (button: HTMLButtonElement | null, popover: HTMLDivElement | null): { left: number; top: number } | null => {
      const trigger = button?.getBoundingClientRect()
      const bounds = popover?.getBoundingClientRect()
      if (!trigger || !bounds) return null
      return {
        left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, trigger.right - bounds.width)),
        top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, trigger.bottom + 4))
      }
    }
    const placePopovers = (): void => {
      const add = place(addButtonRef.current, addPopoverRef.current)
      const manage = place(manageButtonRef.current, managePopoverRef.current)
      if (add) setAddPosition(add)
      if (manage) setManagePosition(manage)
    }
    placePopovers()
    window.addEventListener('resize', placePopovers)
    return () => window.removeEventListener('resize', placePopovers)
  }, [addOpen, manageOpen])

  const chooseSwatchSize = (size: BrushSwatchSize): void => {
    setSwatchSize(size)
    writeStoredString(BRUSH_SWATCH_SIZE_STORAGE_KEY, size)
    setManageOpen(false)
  }

  const navigateToFolder = (folderId: FolderId): void => {
    brushLibraryLocation.set(folderId)
    setSelectedIds(session.brushImageId ? [session.brushImageId] : [])
    setSelectionAnchorId(null)
    setPreviewLocalIds(null)
    setDraggingIds([])
    setDropFolderKey(null)
    setFolderContext(null)
  }

  const openFolderDialog = (): void => {
    setAddOpen(false)
    setFolderDialogMode('create')
    setEditingFolderId(null)
    setFolderName('')
    setFolderError(null)
    setFolderDialogOpen(true)
  }

  const openRenameFolderDialog = (folder: StoredBrushFolder): void => {
    setFolderContext(null)
    setFolderDialogMode('rename')
    setEditingFolderId(folder.id)
    setFolderName(folder.name)
    setFolderError(null)
    setFolderDialogOpen(true)
  }

  const submitFolderDialog = async (): Promise<void> => {
    const name = folderName.trim()
    if (!name) {
      setFolderError(t('brush.folderNameRequired'))
      return
    }
    setFolderBusy(true)
    setFolderError(null)
    try {
      if (folderDialogMode === 'rename' && editingFolderId) await controller.renameFolder(editingFolderId, name)
      else await controller.createFolder(name, currentFolderId)
      setFolderDialogOpen(false)
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : t(folderDialogMode === 'rename' ? 'brush.folderRenameError' : 'brush.folderCreateError'))
    } finally {
      setFolderBusy(false)
    }
  }

  const openFolderContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, folder: StoredBrushFolder): void => {
    event.preventDefault()
    event.stopPropagation()
    setAddOpen(false)
    setManageOpen(false)
    setFolderContext({
      folderId: folder.id,
      x: Math.max(8, Math.min(window.innerWidth - 232, event.clientX)),
      y: Math.max(8, Math.min(window.innerHeight - 76, event.clientY))
    })
  }

  const selectBrush = (event: ReactMouseEvent<HTMLButtonElement>, item: LoadedBrush): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    const orderedIds = displayedBrushes.map((candidate) => candidate.brush.id)
    const isToggle = !event.shiftKey && !event.ctrlKey && !event.metaKey && selectedIds.length === 1 && selectedIds[0] === item.brush.id
    let nextSelection: string[]
    if (isToggle) {
      nextSelection = []
    } else if (event.shiftKey && selectionAnchorId) {
      const from = orderedIds.indexOf(selectionAnchorId)
      const to = orderedIds.indexOf(item.brush.id)
      const range = from >= 0 && to >= 0 ? orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [item.brush.id]
      nextSelection = event.ctrlKey || event.metaKey ? [...new Set([...selectedIds, ...range])] : range
    } else if (event.ctrlKey || event.metaKey) {
      nextSelection = selectedIds.includes(item.brush.id) ? selectedIds.filter((id) => id !== item.brush.id) : [...selectedIds, item.brush.id]
      setSelectionAnchorId(item.brush.id)
    } else {
      nextSelection = [item.brush.id]
      setSelectionAnchorId(item.brush.id)
    }
    setSelectedIds(nextSelection)
    const activeId = nextSelection.includes(item.brush.id) ? item.brush.id : nextSelection.at(-1)
    const activeBrush = activeId ? displayedBrushes.find((candidate) => candidate.brush.id === activeId)?.brush : null
    workspace.setBrushImage(activeBrush ?? null)
  }

  const beginBrushPointer = (event: ReactPointerEvent<HTMLButtonElement>, item: LoadedBrush): void => {
    if (event.button !== 0) return
    suppressClickRef.current = false
    const stored = item.stored
    if (!stored) return
    const sourceFolderId = normalizeFolderId(stored.folderId)
    const selectedLocalIds = selectedIds.filter((id) => {
      const candidate = localById.get(id)?.stored
      return candidate && normalizeFolderId(candidate.folderId) === sourceFolderId
    })
    const movingIds = selectedLocalIds.includes(stored.id) ? selectedLocalIds : [stored.id]
    const baseIds = controller.localBrushes.map((candidate) => candidate.stored?.id).filter((id): id is string => Boolean(id))
    const bounds = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseIds,
      movingIds,
      previewIds: baseIds,
      sourceFolderId,
      dropFolderId: sourceFolderId,
      moved: false,
      element: event.currentTarget,
      brush: item.brush,
      pointerOffsetX: event.clientX - bounds.left,
      pointerOffsetY: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const moveBrushPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    drag.moved = true
    suppressClickRef.current = true
    setDraggingIds(drag.movingIds)
    setDragPreview({
      brush: drag.brush,
      count: drag.movingIds.length,
      left: event.clientX - drag.pointerOffsetX,
      top: event.clientY - drag.pointerOffsetY,
      width: drag.width,
      height: drag.height
    })
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-brush-folder-id], [data-brush-local-id]')
    if (!target) {
      drag.dropFolderId = drag.sourceFolderId
      setDropFolderKey(null)
      drag.previewIds = [...drag.baseIds.filter((id) => !drag.movingIds.includes(id)), ...drag.baseIds.filter((id) => drag.movingIds.includes(id))]
      setPreviewLocalIds(drag.previewIds)
      event.preventDefault()
      return
    }
    const targetFolderId = target.dataset.brushFolderId !== undefined
      ? normalizeFolderId(target.dataset.brushFolderId)
      : normalizeFolderId(localById.get(target.dataset.brushLocalId ?? '')?.stored?.folderId)
    if (targetFolderId !== drag.sourceFolderId) {
      drag.dropFolderId = targetFolderId
      setDropFolderKey(folderKey(targetFolderId))
      setPreviewLocalIds(null)
      event.preventDefault()
      return
    }
    drag.dropFolderId = drag.sourceFolderId
    setDropFolderKey(null)
    const targetId = target.dataset.brushLocalId
    if (targetId && !drag.movingIds.includes(targetId)) {
      const bounds = target.getBoundingClientRect()
      drag.previewIds = moveBrushIds(drag.baseIds, drag.movingIds, targetId, event.clientX >= bounds.left + bounds.width / 2)
      setPreviewLocalIds(drag.previewIds)
    }
    event.preventDefault()
  }

  const finishBrushPointer = (pointerId: number, canceled = false): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== pointerId) return
    dragRef.current = null
    if (drag.element.hasPointerCapture?.(pointerId)) drag.element.releasePointerCapture?.(pointerId)
    setPreviewLocalIds(null)
    setDraggingIds([])
    setDragPreview(null)
    setDropFolderKey(null)
    if (canceled || !drag.moved) {
      suppressClickRef.current = false
      return
    }
    if (drag.dropFolderId !== drag.sourceFolderId) void controller.moveBrushesToFolder(drag.movingIds.flatMap((id) => { const item = localById.get(id); return item ? [item] : [] }), drag.dropFolderId)
    else void controller.reorderLocalBrushes(drag.previewIds)
  }

  const changeSwatchSizeWithWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    const index = BRUSH_SWATCH_SIZE_ORDER.indexOf(swatchSize)
    const nextIndex = Math.max(0, Math.min(BRUSH_SWATCH_SIZE_ORDER.length - 1, index + (event.deltaY > 0 ? -1 : 1)))
    if (nextIndex !== index) chooseSwatchSize(BRUSH_SWATCH_SIZE_ORDER[nextIndex])
  }

  const renderBrush = (item: LoadedBrush) => {
    const selected = selectedIds.includes(item.brush.id) || session.brushImageId === item.brush.id
    const localId = item.stored?.id
    const folderName = item.stored?.folderId ? controller.folders.find((folder) => folder.id === item.stored?.folderId)?.name : null
    const title = `${item.brush.name} (${item.brush.width} × ${item.brush.height})${folderName ? ` · ${folderName}` : ''}${item.project ? ` · ${t('brush.projectBrush')}` : ''}`
    return <button
      key={item.brush.id}
      type="button"
      className={`swatch brush-swatch ${selected ? 'selected' : ''} ${draggingIds.includes(item.brush.id) ? 'dragging' : ''}`}
      data-brush-local-id={localId}
      data-brush-folder-id={folderKey(normalizeFolderId(item.stored?.folderId))}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onPointerDown={(event) => beginBrushPointer(event, item)}
      onClick={(event) => selectBrush(event, item)}
    >
      <span className="brush-swatch-preview" aria-hidden="true">
        <BrushThumbnail source={pixelSource(item.brush)} />
      </span>
      {item.project && <span className="brush-project-badge" aria-hidden="true">P</span>}
    </button>
  }

  const renderFolder = (folder: StoredBrushFolder) => {
    const dropTarget = dropFolderKey === folderKey(folder.id)
    return <button
      key={folder.id}
      type="button"
      className={`brush-folder-item ${dropTarget ? 'drop-target' : ''}`}
      data-brush-folder-id={folder.id}
      title={folder.name}
      aria-label={folder.name}
      onClick={() => navigateToFolder(folder.id)}
      onContextMenu={(event) => openFolderContextMenu(event, folder)}
    ><PixelUtilityIcon kind="folder" /><span>{folder.name}</span><PixelUtilityIcon kind="right" /></button>
  }

  shortcutCommandHandlerRef.current = (id): void => {
    switch (id) {
      case 'importBrushImage': void controller.importFromPicker(); setAddOpen(false); break
      case 'createBrushFolder': openFolderDialog(); break
      case 'openBrushFolder': void window.moonSprite.openBrushFolder(); setManageOpen(false); break
      case 'refreshBrushLibrary': void controller.refresh(); setManageOpen(false); break
      case 'brushLibraryParentFolder': if (currentFolderId !== null) navigateToFolder(currentParentFolderId); break
      case 'brushSwatchSmall': chooseSwatchSize('small'); break
      case 'brushSwatchMedium': chooseSwatchSize('medium'); break
      case 'brushSwatchLarge': chooseSwatchSize('large'); break
      case 'deleteBrushSelection': if (selectedBrushes.length > 0) void controller.deleteBrushes(selectedBrushes); break
    }
  }

  return <><section
    ref={floating.ref}
    className={`panel brush-library-panel ${floating.style ? 'floating-panel' : ''} ${dropActive ? 'drop-active' : ''}`}
    data-command-scope="brushes"
    data-brush-library-dropzone
    style={floating.style}
    onPointerDown={floating.bringToFront}
    onContextMenu={onPanelContextMenu}
    onDragEnter={(event) => { event.preventDefault(); setDropActive(true) }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }}
    onDrop={(event) => {
      event.preventDefault()
      setDropActive(false)
    }}
    >
    <header onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}>
      <strong title={currentFolder?.name}>{currentFolder?.name ?? t('panel.brushes')}</strong>
      <span className="panel-actions brush-panel-actions" onPointerDown={(event) => event.stopPropagation()}>
        <button ref={addButtonRef} type="button" className={addOpen ? 'active' : ''} title={t('brush.add')} aria-label={t('brush.add')} aria-expanded={addOpen} onClick={() => { setAddOpen((open) => !open); setManageOpen(false) }}><PixelUtilityIcon kind="plus" /></button>
        <button type="button" title={t('brush.deleteSelected')} aria-label={t('brush.deleteSelected')} disabled={selectedBrushes.length === 0} onClick={() => void controller.deleteBrushes(selectedBrushes)}><PixelUtilityIcon kind="delete" /></button>
        <button ref={manageButtonRef} type="button" className={manageOpen ? 'active' : ''} title={t('brush.manage')} aria-label={t('brush.manage')} aria-expanded={manageOpen} onClick={() => { setManageOpen((open) => !open); setAddOpen(false) }}><PixelUtilityIcon kind="properties" /></button>
      </span>
    </header>
    <div
      ref={contentRef}
      className={`brush-library-content component-scrollbar ${currentFolderId === null ? 'root-folder' : ''}`}
      style={{ '--brush-swatch-size': `${PALETTE_SWATCH_PIXELS[swatchSize]}px` } as React.CSSProperties}
      onPointerMove={moveBrushPointer}
      onPointerUp={(event) => finishBrushPointer(event.pointerId)}
      onPointerCancel={(event) => finishBrushPointer(event.pointerId, true)}
      onWheel={changeSwatchSizeWithWheel}
    >
      {currentFolderId !== null && <div className="brush-folder-navigation">
        <button
          type="button"
          className={dropFolderKey === folderKey(currentParentFolderId) ? 'drop-target' : ''}
          data-brush-folder-id={folderKey(currentParentFolderId)}
          title={t('brush.backToParentFolder')}
          aria-label={t('brush.backToParentFolder')}
          onClick={() => navigateToFolder(currentParentFolderId)}
        ><PixelUtilityIcon kind="left" /><span>{t('brush.backToParentFolder')}</span></button>
      </div>}
      <div className="brush-library-directory component-scrollbar" data-brush-folder-id={folderKey(currentFolderId)}>
        {visibleFolders.length > 0 && <div className="brush-folder-list">{visibleFolders.map(renderFolder)}</div>}
        <div className={`brush-swatch-grid ${visibleFolders.length === 0 && displayedBrushes.length === 0 ? 'is-empty' : ''}`}>
          {displayedBrushes.map(renderBrush)}
          {visibleFolders.length === 0 && displayedBrushes.length === 0 && <p className="brush-library-panel-state"><strong>{t(currentFolderId === null ? 'brush.emptyLibrary' : 'brush.emptyFolder')}</strong><span>{t(currentFolderId === null ? 'brush.emptyLibraryHint' : 'brush.emptyFolderHint')}</span></p>}
        </div>
      </div>
    </div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section>
  <FloatingDockPreview style={floating.dockPreview} />
  {dragPreview && createPortal(<div className="brush-drag-ghost" style={{ left: dragPreview.left, top: dragPreview.top, width: dragPreview.width, height: dragPreview.height }} aria-hidden="true"><BrushThumbnail source={pixelSource(dragPreview.brush)} />{dragPreview.count > 1 && <span>{dragPreview.count}</span>}</div>, document.body)}
  {addOpen && createPortal(<div ref={addPopoverRef} className="context-menu brush-add-popover" role="menu" aria-label={t('brush.add')} style={addPosition}>
    <button type="button" className="context-menu-item" role="menuitem" onClick={() => { setAddOpen(false); void workspace.createBrushFromSelection() }}><PixelUtilityIcon kind="selectionOutline" /><span>{t('brush.fromSelection')}</span></button>
    <button type="button" className="context-menu-item" role="menuitem" onClick={() => { setAddOpen(false); void controller.importFromPicker() }}><PixelUtilityIcon kind="image" /><span>{t('brush.importImage')}</span></button>
    <button type="button" className="context-menu-item" role="menuitem" onClick={openFolderDialog}><PixelUtilityIcon kind="newFolder" /><span>{t('brush.createFolder')}</span></button>
  </div>, document.body)}
  {manageOpen && createPortal(<div ref={managePopoverRef} className="context-menu brush-manage-popover" role="menu" aria-label={t('brush.manage')} style={managePosition}>
    {BRUSH_SWATCH_SIZE_ORDER.map((size) => <button key={size} type="button" className="context-menu-item" role="menuitemradio" aria-checked={swatchSize === size} title={t('palette.pixels', { count: PALETTE_SWATCH_PIXELS[size] })} onClick={() => chooseSwatchSize(size)}><span className="menu-check">{swatchSize === size && <PixelUtilityIcon kind="check" />}</span><span>{t(BRUSH_SWATCH_SIZE_LABEL_KEYS[size])}</span></button>)}
    <span className="context-menu-divider" />
    <button type="button" className="context-menu-item" role="menuitem" onClick={() => { void window.moonSprite.openBrushFolder(); setManageOpen(false) }}><PixelUtilityIcon kind="folderOpen" /><span>{t('brush.openFolder')}</span></button>
    <button type="button" className="context-menu-item" role="menuitem" onClick={() => { void controller.refresh(); setManageOpen(false) }}><PixelUtilityIcon kind="refresh" /><span>{t('common.refresh')}</span></button>
  </div>, document.body)}
  {folderContext && createPortal(<div ref={folderContextRef} className="context-menu brush-folder-context-menu" role="menu" style={{ left: folderContext.x, top: folderContext.y }}>
    <button type="button" className="context-menu-item" role="menuitem" onClick={() => { const folder = controller.folders.find((candidate) => candidate.id === folderContext.folderId); if (folder) openRenameFolderDialog(folder) }}><PixelUtilityIcon kind="text" /><span>{t('brush.renameFolder')}</span></button>
    <button type="button" className="context-menu-item danger" role="menuitem" onClick={() => { const folder = controller.folders.find((candidate) => candidate.id === folderContext.folderId); setFolderContext(null); if (folder) void controller.deleteFolder(folder) }}><PixelUtilityIcon kind="delete" /><span>{t('brush.deleteFolder')}</span></button>
  </div>, document.body)}
  {folderDialogOpen && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !folderBusy) setFolderDialogOpen(false) }}>
    <ModalShell as="form" storageKey="brush-folder" defaultWidth={420} defaultHeight={250} minWidth={360} minHeight={220} maxWidth={560} maxHeight={360} className="brush-folder-modal" role="dialog" aria-modal="true" aria-labelledby="brush-folder-title" onSubmit={(event) => { event.preventDefault(); void submitFolderDialog() }}>
      <DialogHeader title={t(folderDialogMode === 'rename' ? 'brush.renameFolder' : 'brush.createFolder')} titleId="brush-folder-title" closeLabel={t('common.close')} onClose={() => { if (!folderBusy) setFolderDialogOpen(false) }} />
      <div className="modal-body brush-folder-dialog-body">
        <FormField label={t('brush.folderName')} hint={t(folderDialogMode === 'rename' ? 'brush.folderRenameHint' : 'brush.folderNameHint')}><TextInput autoFocus value={folderName} aria-invalid={Boolean(folderError)} onChange={(event) => { setFolderName(event.target.value); setFolderError(null) }} /></FormField>
        {folderError && <p className="field-error" role="alert">{folderError}</p>}
      </div>
      <footer><button type="button" className="quiet-button" disabled={folderBusy} onClick={() => setFolderDialogOpen(false)}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={folderBusy}>{t(folderDialogMode === 'rename' ? 'brush.renameFolder' : 'common.create')}</button></footer>
    </ModalShell>
  </div>}
  </>
}
