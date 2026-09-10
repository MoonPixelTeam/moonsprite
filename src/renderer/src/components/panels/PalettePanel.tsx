import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePaletteGridColumns } from '@/components/use-palette-grid-columns'
import { paletteGridLines, paletteGridLineClass, paletteAutoCellClass } from '@/components/palette-grid-resize'
import { palettePanelRenderKey } from '@/core/panel-render-keys'
import { createPortal } from 'react-dom'
import type { PaletteEntry, StoredPalette } from '@shared/types'
import { colorCss, rgbaHex } from '@/components/ColorPicker'
import { DialogHeader } from '@/components/DialogHeader'
import { FormField } from '@/components/FormField'
import { FloatingDockPreview, PanelResizeHandles, useFloatingPanel } from '@/components/floating-panel'
import { ModalShell } from '@/components/ModalShell'
import { NumberInput } from '@/components/NumberInput'
import { SegmentedControl } from '@/components/SegmentedControl'
import { TextInput } from '@/components/TextInput'
import { Tooltip } from '@/components/Tooltip'
import type { DockDragProps } from '@/components/workspace-panel-types'
import { encodePalettePng, extractPaletteColors, mergePaletteColors, type PaletteSortDirection, type PaletteSortMode } from '@/core/palette'
import { addPaletteIdToSlots, fitPaletteSlotsToGrid, normalizePaletteColumns, normalizePaletteSlots, PALETTE_SWATCH_PIXELS, paletteColorRoles, paletteColorsEqual, paletteMarkerColor, paletteRangeIdsBySlots, paletteSlotRange, repositionPaletteSlots, type PaletteSwatchSize } from '@/core/palette-layout'
import { ACTIVE_PALETTE_ID_STORAGE_KEY, readStoredString, removeStoredValue, writeStoredString } from '@/core/panel-preferences'
import { colorEquals } from '@/core/raster'
import { builtInPaletteNameKeys } from '@/core/built-in-palettes'
import { joinDirectoryPath } from '@/core/document-files'
import { RECENT_EXPORTS_CHANGED_EVENT, recordRecentExportPath } from '@/core/export-settings'
import { loadEditorPreferences } from '@/core/file-preferences'
import { useWorkspace, type DocumentSession } from '@/store/workspace'
import { useI18n } from '@/components/I18nProvider'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { paletteSamplingShortcutActive } from '@/core/palette-sampling-shortcut'
import { publishCanvasColorSample, publishCanvasColorSamplingCompleted } from '@/components/color-sampling-events'
import { usePanelColorSampling } from '@/components/usePanelColorSampling'
import { EDITOR_SHORTCUT_COMMAND_EVENT, type EditorShortcutCommandDetail } from '@/core/command-context'
import type { ShortcutId } from '@/core/shortcuts'

const PALETTE_SWATCH_SIZE_STORAGE_KEY = 'moonsprite.palette-swatch-size'
const PALETTE_SWATCH_SIZE_ORDER: PaletteSwatchSize[] = ['tiny', 'small', 'medium', 'large', 'huge']
const PALETTE_SWATCH_SIZE_LABEL_KEYS = {
  tiny: 'palette.size.tiny',
  small: 'palette.size.small',
  medium: 'palette.size.medium',
  large: 'palette.size.large',
  huge: 'palette.size.huge'
} as const
const PALETTE_SORT_DIRECTION_STORAGE_KEY = 'moonsprite.palette-sort-direction'
const PALETTE_LAYOUT_MODE_STORAGE_KEY = 'moonsprite.palette-layout-mode'
const PALETTE_SYNC_COLORS_STORAGE_KEY = 'moonsprite.palette-sync-colors'
const PALETTE_SORT_OPTIONS: Array<{ mode: PaletteSortMode; label: 'palette.sort.hue' | 'palette.sort.saturation' | 'palette.sort.brightness' | 'palette.sort.luminance' | 'palette.sort.red' | 'palette.sort.green' | 'palette.sort.blue' | 'palette.sort.alpha' }> = [
  { mode: 'hue', label: 'palette.sort.hue' },
  { mode: 'saturation', label: 'palette.sort.saturation' },
  { mode: 'brightness', label: 'palette.sort.brightness' },
  { mode: 'luminance', label: 'palette.sort.luminance' },
  { mode: 'red', label: 'palette.sort.red' },
  { mode: 'green', label: 'palette.sort.green' },
  { mode: 'blue', label: 'palette.sort.blue' },
  { mode: 'alpha', label: 'palette.sort.alpha' }
]

export function PalettePanel({ session, docked = false, onDockDragStart, onPanelContextMenu, onFloatingDock }: { session: DocumentSession } & DockDragProps) {
  const { t } = useI18n()
  const store = useWorkspace.getState()
  const panelColorSampling = usePanelColorSampling(session.tool)
  const floating = useFloatingPanel(null, false, true, 'moonsprite.palette-panel.v1', true, onFloatingDock, docked)
  const [paletteActionsOpen, setPaletteActionsOpen] = useState(false)
  const [paletteSortDirection, setPaletteSortDirection] = useState<PaletteSortDirection>(() => readStoredString(PALETTE_SORT_DIRECTION_STORAGE_KEY) === 'descending' ? 'descending' : 'ascending')
  const [paletteLayoutMode, setPaletteLayoutMode] = useState<'auto' | 'manual'>(() => readStoredString(PALETTE_LAYOUT_MODE_STORAGE_KEY) === 'auto' ? 'auto' : 'manual')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [extractOpen, setExtractOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [paletteFiles, setPaletteFiles] = useState<StoredPalette[]>([])
  const [paletteDirectory, setPaletteDirectory] = useState('palettes')
  const [paletteLoading, setPaletteLoading] = useState(true)
  const [activePaletteId, setActivePaletteId] = useState<string | null>(() => readStoredString(ACTIVE_PALETTE_ID_STORAGE_KEY))
  const [extractMode, setExtractMode] = useState<'create' | 'replace' | 'append'>('create')
  const [extractLimit, setExtractLimit] = useState(32)
  const [extractName, setExtractName] = useState(() => t('palette.defaultName', { name: session.document.name }))
  const [saveName, setSaveName] = useState(() => t('palette.defaultName', { name: session.document.name }))
  const [operationBusy, setOperationBusy] = useState(false)
  const [paletteContext, setPaletteContext] = useState<{ id: string; x: number; y: number } | null>(null)
  const paletteActionsControlRef = useRef<HTMLSpanElement>(null)
  const libraryControlRef = useRef<HTMLSpanElement>(null)
  const paletteActionsButtonRef = useRef<HTMLButtonElement>(null)
  const libraryButtonRef = useRef<HTMLButtonElement>(null)
  const swatchGridRef = useRef<HTMLDivElement>(null)
  const paletteActionsPopoverRef = useRef<HTMLSpanElement>(null)
  const libraryPopoverRef = useRef<HTMLSpanElement>(null)
  const paletteContextRef = useRef<HTMLSpanElement>(null)
  const shortcutCommandHandlerRef = useRef<(id: ShortcutId) => void>(() => {})
  const [paletteActionsPopoverPosition, setPaletteActionsPopoverPosition] = useState({ left: 8, top: 8 })
  const [libraryPopoverPosition, setLibraryPopoverPosition] = useState({ left: 8, top: 8 })
  const dragRef = useRef<{ ids: number[]; baseSlots: Array<number | null>; previewSlots: Array<number | null>; columns: number; clickedId: number; pointerId: number; element: HTMLElement; startX: number; startY: number; moved: boolean; targetSlot: number | null } | null>(null)
  const selectionGestureRef = useRef<{ pointerId: number; element: HTMLElement; slots: Array<number | null>; columns: number; startSlot: number; lastSlot: number; startX: number; startY: number; clickedId: number | null; active: boolean; longPressTimer: number | null } | null>(null)
  const [draggingIds, setDraggingIds] = useState<number[]>([])
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null)
  const [dropTargetSlot, setDropTargetSlot] = useState<number | null>(null)
  const [paletteEditLocked, setPaletteEditLocked] = useState(() => readStoredString('moonsprite.palette-edit-locked') !== 'false')
  const [syncPaletteColors, setSyncPaletteColors] = useState(() => readStoredString(PALETTE_SYNC_COLORS_STORAGE_KEY) === 'true')
  const visiblePaletteCountRef = useRef(session.document.paletteOrder.length)
  const [palettePreviewSlots, setPalettePreviewSlots] = useState<Array<number | null> | null>(null)
  const [paletteBoxSelection, setPaletteBoxSelection] = useState<{ startSlot: number; endSlot: number } | null>(null)
  const [gestureSelectedIds, setGestureSelectedIds] = useState<number[] | null>(null)
  const [selectionOutlineHovered, setSelectionOutlineHovered] = useState(false)
  const [swatchSize, setSwatchSize] = useState<PaletteSwatchSize>(() => {
    const stored = readStoredString(PALETTE_SWATCH_SIZE_STORAGE_KEY)
    return PALETTE_SWATCH_SIZE_ORDER.includes(stored as PaletteSwatchSize) ? stored as PaletteSwatchSize : 'small'
  })
  // Palette commands can edit arrays in place; identity alone is not a revision.
  const paletteRenderKey = palettePanelRenderKey(session)
  const paletteById = useMemo(() => new Map(session.document.palette.map(entry => [entry.id, entry])), [session.document.palette, paletteRenderKey])
  const ordered = useMemo(() => session.document.paletteOrder.map(id => paletteById.get(id)).filter((entry): entry is PaletteEntry => Boolean(entry)), [session.document.paletteOrder, paletteById])
  const storedColumns = normalizePaletteColumns(session.document.paletteColumns)
  const storedSlots = useMemo(() => normalizePaletteSlots(session.document.palette.map((entry) => entry.id), session.document.paletteOrder, session.document.paletteSlots, storedColumns), [session.document.palette, session.document.paletteOrder, session.document.paletteSlots, storedColumns, paletteRenderKey])
  const occupiedColumns = useMemo(() => storedSlots.reduce<number>((maximum, id, index) => id === null ? maximum : Math.max(maximum, index % storedColumns + 1), 1), [storedSlots, storedColumns])
  const gridColumns = usePaletteGridColumns(swatchGridRef, PALETTE_SWATCH_PIXELS[swatchSize], paletteLayoutMode === 'manual' ? occupiedColumns : 1, paletteLayoutMode, paletteRenderKey)
  // Trailing empty rows have no rendered swatches or hit targets. Retain all
  // occupied coordinates, without rebuilding the palette for height changes.
  const fittedLayout = useMemo(() => fitPaletteSlotsToGrid(storedSlots, storedColumns, gridColumns, 1), [storedSlots, storedColumns, gridColumns])
  const paletteSlots = paletteLayoutMode === 'auto' ? ordered.map((entry) => entry.id) : fittedLayout.slots
  const paletteColumns = paletteLayoutMode === 'auto' ? gridColumns : fittedLayout.columns
  const rawDisplayedSlots = palettePreviewSlots ?? paletteSlots
  const lastOccupiedSlot = rawDisplayedSlots.reduce<number>((last, id, index) => id !== null ? index : last, -1)
  const displayedSlotCount = rawDisplayedSlots.length === 0 ? 0 : Math.max(1, lastOccupiedSlot + 1, paletteLayoutMode === 'manual' ? paletteColumns : 0)
  const displayedSlots = rawDisplayedSlots.slice(0, displayedSlotCount)
  const paletteSurfaceColumns = paletteLayoutMode === 'auto' ? Math.max(1, Math.min(paletteColumns, displayedSlots.length)) : paletteColumns
  const displayedSelectedIds = gestureSelectedIds ?? session.selectedPaletteIds
  const boxSelectionRange = paletteBoxSelection ? paletteSlotRange(paletteColumns, paletteBoxSelection.startSlot, paletteBoxSelection.endSlot) : null
  const selectedSlotIndices = displayedSlots.flatMap((id, index) => id !== null && displayedSelectedIds.includes(id) ? [index] : [])
  const selectedSlotRange = selectedSlotIndices.length > 0
    ? selectedSlotIndices.slice(1).reduce((range, slot) => {
        const point = paletteSlotRange(paletteColumns, slot, slot)
        return { left: Math.min(range.left, point.left), top: Math.min(range.top, point.top), right: Math.max(range.right, point.right), bottom: Math.max(range.bottom, point.bottom) }
      }, paletteSlotRange(paletteColumns, selectedSlotIndices[0], selectedSlotIndices[0]))
    : null
  const gradientSelectionRange = boxSelectionRange ?? (displayedSelectedIds.length >= 2 ? selectedSlotRange : null)
  const gradientSelectionSlots = gradientSelectionRange
    ? Array.from({ length: (gradientSelectionRange.right - gradientSelectionRange.left + 1) * (gradientSelectionRange.bottom - gradientSelectionRange.top + 1) }, (_, index) => {
        const width = gradientSelectionRange.right - gradientSelectionRange.left + 1
        const x = gradientSelectionRange.left + index % width
        const y = gradientSelectionRange.top + Math.floor(index / width)
        return y * paletteColumns + x
      }).filter((slot) => slot < displayedSlots.length)
    : []
  const focusedEmptySlotRange = palettePreviewSlots === null && displayedSelectedIds.length === 0 && focusedSlot !== null && displayedSlots[focusedSlot] === null
    ? paletteSlotRange(paletteColumns, focusedSlot, focusedSlot)
    : null
  const displayedSelectionRange = boxSelectionRange ?? focusedEmptySlotRange ?? selectedSlotRange
  const swatchPresentations = useMemo(() => new Map(session.document.palette.map(entry => {
    const roles = paletteColorRoles(entry.color, session.primaryColor, session.secondaryColor)
    const roleLabel = [roles.primary ? t('palette.foreground') : '', roles.secondary ? t('palette.background') : ''].filter(Boolean).join(t('palette.roleSeparator'))
    return [entry.id, {
      roles,
      label: `${entry.name} ${rgbaHex(entry.color)}${roleLabel ? ` · ${roleLabel}` : ''}`,
      style: { '--swatch-color': colorCss(entry.color), '--swatch-corner-color': paletteMarkerColor(entry.color) } as React.CSSProperties
    }]
  })), [paletteRenderKey, session.document.palette, session.primaryColor, session.secondaryColor, t])
  // Moving colors can temporarily leave holes even in auto mode. Preserve the
  // sparse boundary path for that gesture; compact auto rows use cell borders.
  const paletteAutoBorders = paletteLayoutMode === 'auto' && displayedSlots.every(id => id !== null && paletteById.has(id))
  const paletteLineSegments = paletteAutoBorders ? [] : paletteGridLines(displayedSlots.map(id => id !== null && paletteById.has(id) ? id : null), paletteSurfaceColumns)
  const orderedColors = ordered.map((entry) => ({ ...entry.color }))
  const activePalette = paletteFiles.find((palette) => palette.id === activePaletteId) ?? null
  const paletteDisplayName = (palette: StoredPalette): string => {
    const nameKey = palette.builtIn ? builtInPaletteNameKeys[palette.id] : undefined
    return nameKey ? t(nameKey) : palette.name
  }

  const refreshPalettes = async (preferredId?: string): Promise<void> => {
    setPaletteLoading(true)
    try {
      const listing = await window.moonSprite.listPalettes()
      setPaletteDirectory(listing.directoryPath)
      setPaletteFiles(listing.palettes)
      const matching = listing.palettes.find((palette) => paletteColorsEqual(palette.colors, orderedColors))
      const candidate = preferredId ?? matching?.id ?? null
      const nextId = candidate && listing.palettes.some((palette) => palette.id === candidate) ? candidate : null
      setActivePaletteId(nextId)
      const nextPalette = listing.palettes.find((palette) => palette.id === nextId)
      if (nextPalette) setSaveName(paletteDisplayName(nextPalette))
      if (nextId) writeStoredString(ACTIVE_PALETTE_ID_STORAGE_KEY, nextId)
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : t('palette.readFailed'))
    } finally {
      setPaletteLoading(false)
    }
  }

  useEffect(() => { void refreshPalettes() }, [session.document.id])

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
    if (!paletteActionsOpen && !libraryOpen && !paletteContext) return
    const close = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!paletteActionsControlRef.current?.contains(target) && !paletteActionsPopoverRef.current?.contains(target)) setPaletteActionsOpen(false)
      if (!libraryControlRef.current?.contains(target) && !libraryPopoverRef.current?.contains(target) && !paletteContextRef.current?.contains(target)) setLibraryOpen(false)
      if (!paletteContextRef.current?.contains(target)) setPaletteContext(null)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [paletteActionsOpen, libraryOpen, paletteContext, paletteFiles.length])

  useLayoutEffect(() => {
    if (!paletteActionsOpen && !libraryOpen) return
    const place = (): void => {
      const position = (button: HTMLButtonElement | null, popover: HTMLSpanElement | null): { left: number; top: number } | null => {
        const trigger = button?.getBoundingClientRect()
        const bounds = popover?.getBoundingClientRect()
        if (!trigger || !bounds) return null
        return {
          left: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, trigger.right - bounds.width)),
          top: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, trigger.bottom + 4))
        }
      }
      const actionsPosition = position(paletteActionsButtonRef.current, paletteActionsPopoverRef.current)
      const libraryPosition = position(libraryButtonRef.current, libraryPopoverRef.current)
      if (actionsPosition) setPaletteActionsPopoverPosition(actionsPosition)
      if (libraryPosition) setLibraryPopoverPosition(libraryPosition)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [paletteActionsOpen, libraryOpen])

  const chooseSwatchSize = (value: PaletteSwatchSize): void => {
    setSwatchSize(value)
    writeStoredString(PALETTE_SWATCH_SIZE_STORAGE_KEY, value)
    setPaletteActionsOpen(false)
  }
  const choosePaletteLayoutMode = (value: 'auto' | 'manual'): void => {
    setPaletteLayoutMode(value)
    writeStoredString(PALETTE_LAYOUT_MODE_STORAGE_KEY, value)
    setPaletteActionsOpen(false)
  }
  const togglePaletteEditLock = (): void => {
    setPaletteEditLocked((current) => {
      const next = !current
      writeStoredString('moonsprite.palette-edit-locked', String(next))
      return next
    })
  }
  const togglePaletteColorSynchronization = (): void => {
    setSyncPaletteColors((current) => {
      const next = !current
      writeStoredString(PALETTE_SYNC_COLORS_STORAGE_KEY, String(next))
      return next
    })
  }
  const resolvePaletteSlot = (clientX: number, clientY: number): number | null => {
    const grid = swatchGridRef.current
    const gridBounds = grid?.getBoundingClientRect()
    if (!grid || !gridBounds || clientX < gridBounds.left || clientX > gridBounds.right || clientY < gridBounds.top || clientY > gridBounds.bottom) return null
    const swatches = Array.from(grid.querySelectorAll<HTMLElement>('[data-palette-slot]'))
    for (const swatch of swatches) {
      const bounds = swatch.getBoundingClientRect()
      if (clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) return Number(swatch.dataset.paletteSlot)
    }
    return null
  }
  const pointerHitsPaletteSelectionOutline = (clientX: number, clientY: number): boolean => {
    const outline = swatchGridRef.current?.querySelector<HTMLElement>('[data-palette-selection-outline]')
    if (!outline) return false
    const bounds = outline.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return false
    const tolerance = 6
    const inside = clientX >= bounds.left - tolerance && clientX <= bounds.right + tolerance && clientY >= bounds.top - tolerance && clientY <= bounds.bottom + tolerance
    return inside && (Math.abs(clientX - bounds.left) <= tolerance || Math.abs(bounds.right - clientX) <= tolerance || Math.abs(clientY - bounds.top) <= tolerance || Math.abs(bounds.bottom - clientY) <= tolerance)
  }
  const nearestSelectedPaletteId = (clientX: number, clientY: number): number | null => {
    const selected = new Set(session.selectedPaletteIds)
    const elements = Array.from(swatchGridRef.current?.querySelectorAll<HTMLElement>('[data-palette-id]') ?? [])
      .filter((element) => selected.has(Number(element.dataset.paletteId)))
    let nearest: { id: number; distance: number } | null = null
    for (const element of elements) {
      const bounds = element.getBoundingClientRect()
      const distance = (clientX - (bounds.left + bounds.width / 2)) ** 2 + (clientY - (bounds.top + bounds.height / 2)) ** 2
      if (!nearest || distance < nearest.distance) nearest = { id: Number(element.dataset.paletteId), distance }
    }
    return nearest?.id ?? (session.paletteSelectionId !== null && selected.has(session.paletteSelectionId) ? session.paletteSelectionId : session.selectedPaletteIds[0] ?? null)
  }
  const startPaletteMove = (event: React.PointerEvent<HTMLElement>, clickedId: number): void => {
    const grid = swatchGridRef.current
    if (!grid) return
    const ids = [...session.selectedPaletteIds]
    const baseSlots = [...paletteSlots]
    // A box selection is a temporary gesture; once dragging starts, the outline
    // must be derived from the moving preview slots so it follows the colors.
    setPaletteBoxSelection(null)
    dragRef.current = { ids, baseSlots, previewSlots: baseSlots, columns: paletteColumns, clickedId, pointerId: event.pointerId, element: grid, startX: event.clientX, startY: event.clientY, moved: false, targetSlot: null }
    grid.setPointerCapture?.(event.pointerId)
    setSelectionOutlineHovered(true)
    event.preventDefault()
  }
  const beginPaletteOutlineDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (panelColorSampling.activeForEvent(event.nativeEvent) || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || !pointerHitsPaletteSelectionOutline(event.clientX, event.clientY)) return
    const clickedId = nearestSelectedPaletteId(event.clientX, event.clientY)
    if (clickedId === null) return
    startPaletteMove(event, clickedId)
    event.stopPropagation()
  }
  const beginPaletteDrag = (event: React.PointerEvent<HTMLButtonElement>, slotIndex: number, id: number | null): void => {
    event.currentTarget.focus({ preventScroll: true })
    setFocusedSlot(slotIndex)
    const sampledEntry = id === null ? null : session.document.palette.find((entry) => entry.id === id) ?? null
    const panelSampling = panelColorSampling.activeForEvent(event.nativeEvent)
    if (sampledEntry && panelSampling && (event.button === 0 || event.button === 2)) {
      const secondary = event.button === 2
      if (secondary) store.setSecondaryColor(sampledEntry.color)
      else store.setPrimaryColor(sampledEntry.color)
      publishCanvasColorSample(sampledEntry.color, secondary)
      if (!secondary && paletteSamplingShortcutActive()) store.addPaletteColor(sampledEntry.color)
      publishCanvasColorSamplingCompleted()
      event.preventDefault()
      return
    }
    if (event.button === 2) {
      const color = sampledEntry?.color
      if (color && id !== null) {
        store.selectSecondaryPaletteColor(id)
      }
      return
    }
    if (event.button !== 0) return
    if (event.shiftKey) {
      setPaletteBoxSelection(null)
      const anchorId = session.paletteSelectionId
      if (anchorId !== null) {
        const anchorSlot = paletteSlots.indexOf(anchorId)
        const ids = anchorSlot < 0 ? (id === null ? [] : [id]) : paletteRangeIdsBySlots(paletteSlots, paletteColumns, anchorSlot, slotIndex)
        store.selectPaletteColors(ids, id ?? ids.at(-1) ?? anchorId)
      } else if (id !== null) store.selectPaletteColor(id)
      return
    }
    if (event.ctrlKey || event.metaKey) {
      setPaletteBoxSelection(null)
      if (id !== null) store.selectPaletteColor(id, true)
      return
    }
    if (id === null) setGestureSelectedIds([])
    const captureTarget = swatchGridRef.current ?? event.currentTarget
    const gesture = { pointerId: event.pointerId, element: captureTarget, slots: [...paletteSlots], columns: paletteColumns, startSlot: slotIndex, lastSlot: slotIndex, startX: event.clientX, startY: event.clientY, clickedId: id, active: false, longPressTimer: null as number | null }
    gesture.longPressTimer = window.setTimeout(() => {
      if (selectionGestureRef.current !== gesture) return
      gesture.active = true
      gesture.longPressTimer = null
      const ids = paletteRangeIdsBySlots(gesture.slots, gesture.columns, gesture.startSlot, gesture.lastSlot)
      setPaletteBoxSelection({ startSlot: gesture.startSlot, endSlot: gesture.lastSlot })
      setGestureSelectedIds(ids)
    }, 360)
    selectionGestureRef.current = gesture
    captureTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }
  const movePalettePointer = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag) {
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 1) return
      if (!drag.moved) {
        drag.moved = true
        setDraggingIds(drag.ids)
      }
      const pointerSlot = resolvePaletteSlot(event.clientX, event.clientY)
      if (pointerSlot === null) return
      const preview = repositionPaletteSlots(drag.baseSlots, drag.ids, pointerSlot, drag.clickedId, drag.columns)
      drag.targetSlot = pointerSlot
      setDropTargetSlot(pointerSlot)
      if (preview.length === drag.previewSlots.length && preview.every((entryId, index) => entryId === drag.previewSlots[index])) return
      drag.previewSlots = preview
      setPalettePreviewSlots(preview)
      return
    }
    const gesture = selectionGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) {
      setSelectionOutlineHovered(pointerHitsPaletteSelectionOutline(event.clientX, event.clientY))
      return
    }
    const pointerSlot = resolvePaletteSlot(event.clientX, event.clientY)
    if (pointerSlot === null || pointerSlot === gesture.lastSlot) return
    gesture.lastSlot = pointerSlot
    if (!gesture.active) return
    setPaletteBoxSelection({ startSlot: gesture.startSlot, endSlot: pointerSlot })
    setGestureSelectedIds(paletteRangeIdsBySlots(gesture.slots, gesture.columns, gesture.startSlot, pointerSlot))
  }
  const handlePaletteWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      event.stopPropagation()
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
      if (delta === 0) return
      const currentIndex = PALETTE_SWATCH_SIZE_ORDER.indexOf(swatchSize)
      const nextIndex = Math.max(0, Math.min(PALETTE_SWATCH_SIZE_ORDER.length - 1, currentIndex + (delta < 0 ? 1 : -1)))
      if (nextIndex !== currentIndex) chooseSwatchSize(PALETTE_SWATCH_SIZE_ORDER[nextIndex])
      return
    }
    if (!event.altKey) return
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (delta === 0) return
    event.currentTarget.scrollLeft += delta
    event.preventDefault()
  }
  const isPaletteInteractionTarget = (target: Node | null): boolean => Boolean(target && (
    floating.ref.current?.contains(target)
    || paletteActionsPopoverRef.current?.contains(target)
    || libraryPopoverRef.current?.contains(target)
    || paletteContextRef.current?.contains(target)
    || (target instanceof Element && target.closest('.palette-operation-dialog'))
    || (!paletteEditLocked && target instanceof Element && target.closest('.color-panel, .color-editor-popover'))
  ))
  const clearPaletteSelection = (): void => {
    setFocusedSlot(null)
    setPaletteBoxSelection(null)
    setGestureSelectedIds(null)
    useWorkspace.getState().selectPaletteColors([], -1)
  }
  const clearPaletteFocus = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (isPaletteInteractionTarget(event.relatedTarget)) return
    clearPaletteSelection()
  }
  const finishPaletteDrag = (): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture?.(drag.pointerId)
    if (drag?.moved && drag.targetSlot !== null) useWorkspace.getState().reorderPaletteColors(drag.ids, drag.previewSlots, drag.columns)
    setDraggingIds([])
    setDropTargetSlot(null)
    setPalettePreviewSlots(null)
    setSelectionOutlineHovered(false)
  }
  const finishPaletteSelection = (canceled = false): void => {
    const gesture = selectionGestureRef.current
    selectionGestureRef.current = null
    if (!gesture) return
    if (gesture.longPressTimer !== null) window.clearTimeout(gesture.longPressTimer)
    if (gesture.element.hasPointerCapture?.(gesture.pointerId)) gesture.element.releasePointerCapture?.(gesture.pointerId)
    if (!canceled) {
      if (gesture.active) {
        const ids = paletteRangeIdsBySlots(gesture.slots, gesture.columns, gesture.startSlot, gesture.lastSlot)
        const targetId = gesture.slots[gesture.lastSlot]
        setPaletteBoxSelection({ startSlot: gesture.startSlot, endSlot: gesture.lastSlot })
        useWorkspace.getState().selectPaletteColors(ids, targetId ?? ids.at(-1) ?? -1)
      } else if (gesture.clickedId !== null) {
        setPaletteBoxSelection(null)
        useWorkspace.getState().selectPaletteColor(gesture.clickedId)
      } else {
        setPaletteBoxSelection(null)
        useWorkspace.getState().selectPaletteColors([], -1)
      }
    }
    setGestureSelectedIds(null)
  }
  const finishPalettePointer = (pointerId: number, canceled = false): void => {
    if (dragRef.current?.pointerId === pointerId) finishPaletteDrag()
    if (selectionGestureRef.current?.pointerId === pointerId) finishPaletteSelection(canceled)
  }
  const addCurrentColorToSlot = (slotIndex: number): void => {
    const workspace = useWorkspace.getState()
    const id = workspace.addPaletteColor(session.primaryColor)
    if (id === null) return
    if (paletteLayoutMode === 'auto') {
      if (!paletteEditLocked) {
        setFocusedSlot(null)
        setPaletteBoxSelection(null)
        setGestureSelectedIds(null)
      }
      return
    }
    const withColor = addPaletteIdToSlots(paletteSlots, id, paletteColumns)
    const placed = repositionPaletteSlots(withColor, [id], slotIndex, id, paletteColumns)
    useWorkspace.getState().reorderPaletteColors([id], placed, paletteColumns)
    if (!paletteEditLocked) {
      setFocusedSlot(null)
      setPaletteBoxSelection(null)
      setGestureSelectedIds(null)
    }
  }

  useEffect(() => {
    const previousCount = visiblePaletteCountRef.current
    const nextCount = session.document.paletteOrder.length
    visiblePaletteCountRef.current = nextCount
    if (paletteEditLocked || nextCount <= previousCount) return
    setFocusedSlot(null)
    setPaletteBoxSelection(null)
    setGestureSelectedIds(null)
  }, [paletteEditLocked, session.document.paletteOrder.length])

  useEffect(() => {
    const clearSelectionOutside = (event: PointerEvent): void => {
      if (isPaletteInteractionTarget(event.target as Node | null)) return
      const active = useWorkspace.getState().sessions.find((item) => item.document.id === session.document.id)
      if (!active) return
      clearPaletteSelection()
    }
    window.addEventListener('pointerdown', clearSelectionOutside, true)
    return () => window.removeEventListener('pointerdown', clearSelectionOutside, true)
  }, [session.document.id, paletteEditLocked])

  useEffect(() => {
    const finishPointer = (event: PointerEvent): void => {
      finishPalettePointer(event.pointerId)
    }
    const cancelPointer = (event: PointerEvent): void => { finishPalettePointer(event.pointerId, true) }
    const finishOutside = (event: PointerEvent): void => {
      if (event.relatedTarget !== null) return
      if (dragRef.current) finishPaletteDrag()
      if (selectionGestureRef.current) finishPaletteSelection(true)
    }
    const finishBlur = (): void => {
      if (dragRef.current) finishPaletteDrag()
      if (selectionGestureRef.current) finishPaletteSelection(true)
    }
    window.addEventListener('pointerup', finishPointer, true)
    window.addEventListener('pointercancel', cancelPointer, true)
    window.addEventListener('pointerout', finishOutside, true)
    window.addEventListener('blur', finishBlur)
    return () => {
      window.removeEventListener('pointerup', finishPointer, true)
      window.removeEventListener('pointercancel', cancelPointer, true)
      window.removeEventListener('pointerout', finishOutside, true)
      window.removeEventListener('blur', finishBlur)
      const gesture = selectionGestureRef.current
      if (gesture?.longPressTimer !== null && gesture?.longPressTimer !== undefined) window.clearTimeout(gesture.longPressTimer)
    }
  }, [])

  useEffect(() => {
    const close = (event: Event): void => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (target && target !== 'palette') return
      if (saveOpen) setSaveOpen(false)
      else if (extractOpen) setExtractOpen(false)
      else if (paletteContext) setPaletteContext(null)
      else if (libraryOpen) setLibraryOpen(false)
      else if (paletteActionsOpen) setPaletteActionsOpen(false)
    }
    window.addEventListener('moonsprite:close-dialog', close)
    return () => window.removeEventListener('moonsprite:close-dialog', close)
  }, [extractOpen, libraryOpen, paletteActionsOpen, paletteContext, saveOpen])

  const upsertPalette = (palette: StoredPalette): void => {
    setPaletteFiles((current) => {
      const existingIndex = current.findIndex((item) => item.id === palette.id)
      if (existingIndex < 0) return [...current, palette]
      const next = [...current]
      next[existingIndex] = palette
      return next
    })
    setActivePaletteId(palette.id)
    writeStoredString(ACTIVE_PALETTE_ID_STORAGE_KEY, palette.id)
  }

  const applyStoredPalette = (palette: StoredPalette): void => {
    const layout = palette.columns !== undefined && palette.slots !== undefined
      ? { columns: palette.columns, slots: palette.slots }
      : undefined
    store.applyPalette(palette.colors, layout)
    setActivePaletteId(palette.id)
    setSaveName(paletteDisplayName(palette))
    writeStoredString(ACTIVE_PALETTE_ID_STORAGE_KEY, palette.id)
    setLibraryOpen(false)
  }

  const deleteStoredPalette = async (id: string): Promise<void> => {
    const palette = paletteFiles.find((item) => item.id === id)
    if (!palette || palette.builtIn) { store.setMessage(t('palette.builtInDeleteBlocked')); return }
    try {
      await window.moonSprite.deletePalette(id)
      setPaletteFiles((current) => current.filter((item) => item.id !== id))
      if (activePaletteId === id) {
        setActivePaletteId(null)
        removeStoredValue(ACTIVE_PALETTE_ID_STORAGE_KEY)
      }
      setPaletteContext(null)
      store.setMessage(t('palette.deleted', { name: palette.name }))
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : t('palette.deleteFailed'))
    }
  }

  const openExtractDialog = (): void => {
    setExtractName(t('palette.defaultName', { name: session.document.name }))
    setExtractMode('create')
    setExtractOpen(true)
    setLibraryOpen(false)
    setPaletteActionsOpen(false)
  }

  const extractFromImage = async (): Promise<void> => {
    setOperationBusy(true)
    try {
      const colors = extractPaletteColors(session.document, extractLimit)
      if (colors.length === 0) throw new Error(t('palette.noOpaqueColors'))
      if (extractMode === 'create') {
        store.applyPalette(colors)
        setActivePaletteId(null)
        removeStoredValue(ACTIVE_PALETTE_ID_STORAGE_KEY)
        const name = extractName.trim() || t('palette.defaultName', { name: session.document.name })
        setSaveName(name)
        store.setMessage(t('palette.createdTemporary', { name, count: colors.length }))
      } else if (extractMode === 'replace') {
        store.applyPalette(colors)
        store.setMessage(t('palette.replaced', { count: colors.length }))
      } else {
        const merged = mergePaletteColors(orderedColors, colors)
        store.applyPalette(merged)
        store.setMessage(t('palette.appended', { count: merged.length - orderedColors.length }))
      }
      setExtractOpen(false)
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : t('palette.extractFailed'))
    } finally {
      setOperationBusy(false)
    }
  }

  const openSaveDialog = (): void => {
    setSaveName(activePalette ? paletteDisplayName(activePalette) : (saveName || t('palette.defaultName', { name: session.document.name })))
    setSaveOpen(true)
    setLibraryOpen(false)
    setPaletteActionsOpen(false)
  }

  const sortPalette = (mode: PaletteSortMode): void => {
    store.sortPaletteColors(mode, paletteSortDirection)
    setPaletteActionsOpen(false)
  }

  const applyPaletteGradient = (byHue: boolean): void => {
    if (gradientSelectionSlots.length >= 2) store.gradientPaletteSlots(gradientSelectionSlots, displayedSlots, paletteColumns, byHue)
    else store.gradientPaletteColors(byHue)
    setPaletteActionsOpen(false)
  }

  const choosePaletteSortDirection = (direction: PaletteSortDirection): void => {
    setPaletteSortDirection(direction)
    writeStoredString(PALETTE_SORT_DIRECTION_STORAGE_KEY, direction)
  }

  const savePaletteLocally = async (target: 'new' | 'current'): Promise<void> => {
    if (orderedColors.length === 0) { store.setMessage(t('palette.noColorsToSave')); return }
    if (target === 'current' && (!activePalette || activePalette.builtIn)) return
    setOperationBusy(true)
    try {
      const indexById = new Map(ordered.map((entry, index) => [entry.id, index]))
      const savedSlots = storedSlots.map((id) => id === null ? null : indexById.get(id) ?? null)
      const saved = await window.moonSprite.savePalette(target === 'current' ? activePalette!.id : null, saveName.trim() || t('palette.defaultName', { name: session.document.name }), orderedColors, storedColumns, savedSlots)
      upsertPalette(saved)
      setSaveOpen(false)
      store.setMessage(t('palette.saved', { name: saved.name, directory: paletteDirectory }))
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : t('palette.saveFailed'))
    } finally {
      setOperationBusy(false)
    }
  }

  const savePaletteAsImage = async (): Promise<void> => {
    if (orderedColors.length === 0) { store.setMessage(t('palette.noColorsToSave')); return }
    setOperationBusy(true)
    try {
      const safeName = (saveName.trim() || t('palette.defaultName', { name: session.document.name })).replace(/[<>:"/\\|?*]/g, '_')
      const result = await window.moonSprite.savePaletteImage(joinDirectoryPath(loadEditorPreferences().exportDirectory, `${safeName}.png`))
      if (result.canceled || !result.filePath) return
      const encoded = encodePalettePng(orderedColors)
      await window.moonSprite.writeBinaryAtomic(result.filePath, encoded.bytes)
      if (recordRecentExportPath(result.filePath)) window.dispatchEvent(new Event(RECENT_EXPORTS_CHANGED_EVENT))
      setSaveOpen(false)
      store.setMessage(t('palette.imageSaved', { path: result.filePath }))
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : t('palette.imageSaveFailed'))
    } finally {
      setOperationBusy(false)
    }
  }

  shortcutCommandHandlerRef.current = (id): void => {
    switch (id) {
      case 'togglePaletteEditLock': togglePaletteEditLock(); break
      case 'extractPaletteColors': openExtractDialog(); break
      case 'togglePaletteColorSync': togglePaletteColorSynchronization(); break
      case 'reversePaletteColors': store.reversePaletteColors(); setPaletteActionsOpen(false); break
      case 'createPaletteGradient': if (gradientSelectionSlots.length >= 2) applyPaletteGradient(false); break
      case 'createPaletteHueGradient': if (gradientSelectionSlots.length >= 2) applyPaletteGradient(true); break
      case 'sortPaletteHue': sortPalette('hue'); break
      case 'sortPaletteSaturation': sortPalette('saturation'); break
      case 'sortPaletteBrightness': sortPalette('brightness'); break
      case 'sortPaletteLuminance': sortPalette('luminance'); break
      case 'sortPaletteRed': sortPalette('red'); break
      case 'sortPaletteGreen': sortPalette('green'); break
      case 'sortPaletteBlue': sortPalette('blue'); break
      case 'sortPaletteAlpha': sortPalette('alpha'); break
      case 'paletteSortAscending': choosePaletteSortDirection('ascending'); break
      case 'paletteSortDescending': choosePaletteSortDirection('descending'); break
      case 'paletteSwatchTiny': chooseSwatchSize('tiny'); break
      case 'paletteSwatchSmall': chooseSwatchSize('small'); break
      case 'paletteSwatchMedium': chooseSwatchSize('medium'); break
      case 'paletteSwatchLarge': chooseSwatchSize('large'); break
      case 'paletteSwatchHuge': chooseSwatchSize('huge'); break
      case 'savePalette': openSaveDialog(); break
      case 'openPaletteFolder': void window.moonSprite.openPaletteFolder(); setLibraryOpen(false); break
      case 'refreshPalettes': void refreshPalettes(activePaletteId ?? undefined); break
    }
  }

  return <><section ref={floating.ref} className={`panel palette-panel ${panelColorSampling.active ? 'panel-color-sampling' : ''} ${floating.style ? 'floating-panel' : ''}`} data-command-scope="palette" style={floating.style} onPointerDown={floating.bringToFront} onContextMenu={onPanelContextMenu}>
    <header aria-label={t('panel.palette')} onPointerDown={(event) => floating.style ? floating.startDrag(event) : onDockDragStart?.(event, floating.startDetachedDrag)}><span className="panel-actions palette-actions" onPointerDown={(event) => event.stopPropagation()}>
      <span ref={libraryControlRef} className="palette-library-control"><button ref={libraryButtonRef} className={libraryOpen ? 'active' : ''} title={t('palette.chooseLocal')} aria-label={t('palette.chooseLocal')} aria-expanded={libraryOpen} onClick={() => { setLibraryOpen((open) => !open); setPaletteActionsOpen(false) }}><PixelUtilityIcon kind="paletteLocal" /></button></span>
      <span ref={paletteActionsControlRef} className="palette-actions-control"><button ref={paletteActionsButtonRef} className={paletteActionsOpen ? 'active' : ''} title={t('palette.actions')} aria-label={t('palette.actions')} aria-expanded={paletteActionsOpen} onClick={() => { setPaletteActionsOpen((open) => !open); setLibraryOpen(false) }}><PixelUtilityIcon kind="properties" /></button></span>
      <button className={paletteEditLocked ? '' : 'active'} title={t(paletteEditLocked ? 'palette.unlockEditing' : 'palette.lockEditing')} aria-label={t(paletteEditLocked ? 'palette.unlockEditing' : 'palette.lockEditing')} aria-pressed={!paletteEditLocked} onClick={togglePaletteEditLock}>{paletteEditLocked ? <PixelUtilityIcon kind="lock" /> : <PixelUtilityIcon kind="unlock" />}</button>
    </span><small>{t('palette.colorCount', { count: ordered.length })}</small></header>
    <div
      ref={swatchGridRef}
      className={`swatch-grid component-scrollbar ${selectionOutlineHovered ? 'selection-outline-hovered' : ''}`}
      style={{ '--swatch-size': `${PALETTE_SWATCH_PIXELS[swatchSize]}px`, '--palette-swatch-gap': '1px', '--palette-columns': paletteColumns, '--palette-surface-columns': paletteSurfaceColumns } as React.CSSProperties}
      onPointerDownCapture={beginPaletteOutlineDrag}
      onPointerMove={movePalettePointer}
      onPointerLeave={() => { if (!dragRef.current && !selectionGestureRef.current) setSelectionOutlineHovered(false) }}
      onPointerUp={(event) => finishPalettePointer(event.pointerId)}
      onPointerCancel={(event) => finishPalettePointer(event.pointerId, true)}
      onWheel={handlePaletteWheel}
      onBlur={clearPaletteFocus}
    >
      <span className={`palette-swatch-grid-surface ${paletteLayoutMode === 'manual' ? 'palette-grid-manual' : paletteAutoBorders ? 'palette-grid-auto' : ''}`} style={{ '--palette-layout-columns': paletteSurfaceColumns, '--palette-layout-rows': Math.ceil(displayedSlots.length / paletteSurfaceColumns) } as React.CSSProperties}>
      {displayedSlots.map((id, slotIndex) => {
        const entry = id === null ? null : paletteById.get(id) ?? null
        const presentation = entry ? swatchPresentations.get(entry.id) : undefined
        const roles = presentation?.roles ?? { primary: false, secondary: false }
        const selected = Boolean(entry && displayedSelectedIds.includes(entry.id))
        const label = presentation?.label ?? t('palette.emptySlot', { index: slotIndex + 1 })
        return <span key={slotIndex} className={`palette-swatch-wrap ${entry ? 'palette-swatch-occupied' : ''} ${paletteAutoBorders ? paletteAutoCellClass(slotIndex, paletteSurfaceColumns, displayedSlots.length) : ''}`.trim()} style={paletteLayoutMode === 'manual' ? { left: `calc(${slotIndex % paletteColumns} * (var(--swatch-size) + var(--palette-swatch-gap)))`, top: `calc(${Math.floor(slotIndex / paletteColumns)} * (var(--swatch-size) + var(--palette-swatch-gap)))` } : undefined}><button
          data-palette-slot={slotIndex}
          data-palette-id={entry?.id}
          className={`swatch palette-slot ${entry ? 'occupied' : 'empty'} ${focusedSlot === slotIndex ? 'focused' : ''} ${selected ? 'selected' : ''} ${roles.primary ? 'primary' : ''} ${roles.secondary ? 'secondary' : ''} ${entry?.color.a === 0 ? 'transparent' : ''} ${entry && draggingIds.includes(entry.id) ? 'dragging' : ''} ${dropTargetSlot === slotIndex ? 'drop-target' : ''}`}
          title={label}
          aria-label={label}
          aria-pressed={selected}
          style={presentation?.style}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => beginPaletteDrag(event, slotIndex, entry?.id ?? null)}
          onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); addCurrentColorToSlot(slotIndex) }}
        /></span>
      })}
      {paletteLineSegments.map((segment) => <span key={segment.key} data-palette-line={segment.key} className={paletteGridLineClass(segment)} hidden={segment.hidden} aria-hidden="true" style={{ '--palette-line-column': segment.column, '--palette-line-row': segment.row } as React.CSSProperties} />)}
      </span>
      {displayedSelectionRange && <span data-palette-selection-outline className="palette-selection-box" aria-hidden="true" style={{ '--palette-selection-left': displayedSelectionRange.left, '--palette-selection-top': displayedSelectionRange.top, '--palette-selection-width': displayedSelectionRange.right - displayedSelectionRange.left + 1, '--palette-selection-height': displayedSelectionRange.bottom - displayedSelectionRange.top + 1 } as React.CSSProperties} />}
    </div>
    {floating.style && <PanelResizeHandles onResize={floating.startResize} />}
  </section>
  <FloatingDockPreview style={floating.dockPreview} />
  {libraryOpen && createPortal(<span ref={libraryPopoverRef} className="palette-library-popover component-scrollbar" role="menu" aria-label={t('palette.localPalettes')} style={libraryPopoverPosition}>{paletteLoading ? <span className="palette-library-state">{t('palette.loading')}</span> : paletteFiles.length === 0 ? <span className="palette-library-state">{t('palette.empty')}</span> : paletteFiles.map((palette) => <button key={palette.id} type="button" role="menuitem" className={activePaletteId === palette.id ? 'selected' : ''} title={t(palette.builtIn ? 'palette.builtInHint' : 'palette.userDeleteHint')} onClick={() => applyStoredPalette(palette)} onContextMenu={(event) => { event.preventDefault(); if (palette.builtIn) { store.setMessage(t('palette.builtInDeleteBlocked')); setPaletteContext(null); return } setPaletteContext({ id: palette.id, x: Math.min(event.clientX, window.innerWidth - 150), y: Math.min(event.clientY, window.innerHeight - 42) }) }}><span className="palette-library-name">{paletteDisplayName(palette)}{palette.builtIn && <PixelUtilityIcon kind="lock" />}</span><span className="palette-library-swatches" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${Math.max(1, palette.colors.length)}, minmax(0, 1fr))` }}>{palette.colors.map((color, index) => <i key={index} style={{ background: colorCss(color) }} />)}</span></button>)}<span className="palette-library-actions"><button type="button" className="quiet-button" onClick={() => { void window.moonSprite.openPaletteFolder(); setLibraryOpen(false) }}><PixelUtilityIcon kind="folderOpen" /><span>{t('palette.openUserFolder')}</span></button><button type="button" className="quiet-button" disabled={paletteLoading} onClick={() => void refreshPalettes(activePaletteId ?? undefined)}><PixelUtilityIcon kind="refresh" /><span>{t('palette.refresh')}</span></button></span></span>, document.body)}
  {paletteActionsOpen && createPortal(<span ref={paletteActionsPopoverRef} className="palette-actions-popover context-menu" role="menu" aria-label={t('palette.actions')} style={paletteActionsPopoverPosition}><span className="palette-layout-mode-menu" role="group" aria-label={t('palette.layoutMode')}>{(['auto', 'manual'] as const).map((mode) => <button key={mode} type="button" className="context-menu-item" role="menuitemradio" aria-checked={paletteLayoutMode === mode} onClick={() => choosePaletteLayoutMode(mode)}><span className="menu-check">{paletteLayoutMode === mode && <PixelUtilityIcon kind="check" />}</span><span className="palette-menu-label">{t(mode === 'auto' ? 'palette.layoutAuto' : 'palette.layoutManual')}</span></button>)}</span><span className="context-menu-divider" /><button type="button" className="context-menu-item" role="menuitem" onClick={openExtractDialog}><PixelUtilityIcon kind="extractColors" /><span className="palette-menu-label">{t('palette.extractColors')}</span></button><Tooltip className="palette-menu-tooltip" content={<><strong>{t('palette.syncColors')}</strong><span>{t('palette.syncColorsHint')}</span></>}><button type="button" className="context-menu-item" role="menuitemcheckbox" aria-checked={syncPaletteColors} onClick={togglePaletteColorSynchronization}><span className="menu-check">{syncPaletteColors && <PixelUtilityIcon kind="check" />}</span><span className="palette-menu-label">{t('palette.syncColors')}</span></button></Tooltip><span className="context-menu-divider" /><div className="menu-submenu palette-sort-menu"><button type="button" className="context-menu-item menu-submenu-trigger" aria-haspopup="menu"><PixelUtilityIcon kind="moreLines" /><span className="menu-submenu-label">{t('palette.sortAndGradients')}</span><span className="menu-submenu-arrow" aria-hidden="true"><PixelUtilityIcon kind="right" /></span></button><span className="context-menu menu-popover menu-submenu-popover palette-sort-popover component-scrollbar" role="menu" aria-label={t('palette.sortAndGradients')}><button type="button" className="context-menu-item" role="menuitem" onClick={() => { store.reversePaletteColors(); setPaletteActionsOpen(false) }}><PixelUtilityIcon kind="redo" /><span>{t('palette.reverseColors')}</span></button><button type="button" className="context-menu-item" role="menuitem" disabled={gradientSelectionSlots.length < 2} title={gradientSelectionSlots.length < 2 ? t('palette.gradientSelectionRequired') : undefined} onClick={() => applyPaletteGradient(false)}><span className="palette-sort-preview" data-sort-mode="gradient" aria-hidden="true" /><span>{t('palette.gradient')}</span></button><button type="button" className="context-menu-item" role="menuitem" disabled={gradientSelectionSlots.length < 2} title={gradientSelectionSlots.length < 2 ? t('palette.gradientSelectionRequired') : undefined} onClick={() => applyPaletteGradient(true)}><span className="palette-sort-preview" data-sort-mode="hue-gradient" aria-hidden="true" /><span>{t('palette.hueGradient')}</span></button><span className="context-menu-divider" />{PALETTE_SORT_OPTIONS.map((option) => <button key={option.mode} type="button" className="context-menu-item" role="menuitem" onClick={() => sortPalette(option.mode)}><span className="palette-sort-preview" data-sort-mode={option.mode} aria-hidden="true" /><span>{t(option.label)}</span></button>)}<span className="context-menu-divider" />{(['ascending', 'descending'] as PaletteSortDirection[]).map((direction) => <button key={direction} type="button" className="context-menu-item" role="menuitemradio" aria-checked={paletteSortDirection === direction} onClick={() => choosePaletteSortDirection(direction)}><span className="menu-check">{paletteSortDirection === direction && <PixelUtilityIcon kind="check" />}</span><span>{t(direction === 'ascending' ? 'palette.sort.ascending' : 'palette.sort.descending')}</span></button>)}</span></div><span className="context-menu-divider" />{PALETTE_SWATCH_SIZE_ORDER.map((size) => <button key={size} type="button" className="context-menu-item" role="menuitemradio" aria-checked={swatchSize === size} title={t('palette.pixels', { count: PALETTE_SWATCH_PIXELS[size] })} onClick={() => chooseSwatchSize(size)}><span className="menu-check">{swatchSize === size && <PixelUtilityIcon kind="check" />}</span><span className="palette-menu-label">{t(PALETTE_SWATCH_SIZE_LABEL_KEYS[size])}</span></button>)}<span className="context-menu-divider" /><button type="button" className="context-menu-item" role="menuitem" onClick={openSaveDialog}><PixelUtilityIcon kind="save" /><span className="palette-menu-label">{t('palette.savePalette')}</span></button></span>, document.body)}
  {paletteContext && createPortal(<span ref={paletteContextRef} className="palette-library-context" role="menu" style={{ left: paletteContext.x, top: paletteContext.y }}><button type="button" role="menuitem" onClick={() => void deleteStoredPalette(paletteContext.id)}><PixelUtilityIcon kind="delete" /><span>{t('palette.deletePalette')}</span></button></span>, document.body)}
  {extractOpen && createPortal(<ModalShell as="form" storageKey="palette-extract" defaultWidth={480} defaultHeight={430} minWidth={480} className="palette-operation-dialog" role="dialog" aria-labelledby="palette-extract-title" onSubmit={(event) => { event.preventDefault(); void extractFromImage() }}>
    <DialogHeader eyebrow="PALETTE" title={t('palette.extractTitle')} titleId="palette-extract-title" closeLabel={t('common.close')} onClose={() => setExtractOpen(false)} />
    <div className="modal-body palette-dialog-body">
      <FormField className="palette-extract-mode-field" label={t('palette.extractMethod')} hint={extractMode === 'create' ? t('palette.extract.createHint') : extractMode === 'replace' ? t('palette.extract.replaceHint') : t('palette.extract.appendHint')}><SegmentedControl<'create' | 'replace' | 'append'> className="palette-extract-mode-control" label={t('palette.extractMethod')} value={extractMode} options={[{ value: 'create', label: t('palette.extract.create'), description: t('palette.extract.createHint') }, { value: 'replace', label: t('palette.extract.replace', { name: activePalette ? `“${paletteDisplayName(activePalette)}”` : '' }), description: t('palette.extract.replaceHint') }, { value: 'append', label: t('palette.extract.append'), description: t('palette.extract.appendHint') }]} onChange={setExtractMode} /></FormField>
      <div className="palette-form-grid"><FormField label={t('palette.extract.limit')}><NumberInput min={1} max={4096} value={extractLimit} onValueChange={setExtractLimit} /></FormField>{extractMode === 'create' && <FormField label={t('palette.name')}><TextInput value={extractName} onChange={(event) => setExtractName(event.target.value)} /></FormField>}</div>
    </div>
    <footer><button type="button" className="quiet-button" onClick={() => setExtractOpen(false)}>{t('common.cancel')}</button><button type="submit" className="primary-button" disabled={operationBusy}>{operationBusy ? t('palette.extracting') : t('palette.extractColors')}</button></footer>
  </ModalShell>, document.body)}
  {saveOpen && createPortal(<ModalShell storageKey="palette-save" defaultWidth={400} defaultHeight={300} minWidth={360} className="palette-operation-dialog palette-save-dialog" role="dialog" aria-labelledby="palette-save-title">
    <DialogHeader eyebrow="PALETTE" title={t('palette.saveTitle')} titleId="palette-save-title" closeLabel={t('common.close')} onClose={() => setSaveOpen(false)} />
    <div className="modal-body palette-dialog-body"><FormField className="palette-name-field" label={t('palette.name')}><TextInput autoFocus value={saveName} onChange={(event) => setSaveName(event.target.value)} /></FormField><div className="palette-save-summary"><span className="palette-library-swatches" aria-hidden="true">{orderedColors.slice(0, 24).map((color, index) => <i key={index} style={{ background: colorCss(color) }} />)}</span><strong>{t('palette.colorCount', { count: orderedColors.length })}</strong></div><p>{t('palette.directory', { directory: paletteDirectory })}</p></div>
    <footer><button type="button" className="quiet-button" disabled={operationBusy} onClick={() => void savePaletteAsImage()}><PixelUtilityIcon kind="export" /><span className="button-press-content">{t('palette.savePng')}</span></button><button type="button" className={activePalette && !activePalette.builtIn ? 'quiet-button' : 'primary-button'} disabled={operationBusy} onClick={() => void savePaletteLocally('new')}><PixelUtilityIcon kind="plus" /><span className="button-press-content">{t('palette.saveAsNew')}</span></button>{activePalette && !activePalette.builtIn && <button type="button" className="primary-button" disabled={operationBusy} onClick={() => void savePaletteLocally('current')}><PixelUtilityIcon kind="save" /><span className="button-press-content">{t('palette.saveToCurrent', { name: paletteDisplayName(activePalette) })}</span></button>}</footer>
  </ModalShell>, document.body)}
  </>
}
