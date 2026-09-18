import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ToolId } from '@shared/types-brush'
import type { ToolRailSide } from '@shared/types-workspace'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { Tooltip } from '@/components/Tooltip'
import { useI18n } from '@/components/I18nProvider'
import { toolRailRenderKey } from '@/components/app/app-render-keys'
import { readStoredString, writeStoredString } from '@/core/storage'
import { temporaryMoveToolAllowed } from '@/core/canvas-input'
import { formatShortcutBindingsForLocale, loadShortcutBindings, modifierShortcutHeldByBindings, shortcutBindingsFor, shortcutDisplayText, type ShortcutId } from '@/core/shortcuts'
import { applyQuickToolTarget } from '@/core/quick-tools'
import { currentHeldShortcutKeyParts, useQuickToolShortcut } from '@/components/useQuickToolShortcut'
import { useWorkspace } from '@/store/workspace'
import { isToolAvailableForSession } from '@/store/workspace-session'
import { ALL_EDITOR_TOOL_ICONS, FILL_KIND_ICONS, PixelAssetIcon, SELECTION_KIND_ICONS, activeToolPresentation, fillKindDefinitions, lineKindDefinitions, moveKindDefinitions, selectionKindDefinitions, shapeKindDefinitions, toolDefinitions } from './editor-tools'

interface EditorToolRailProps {
  side: ToolRailSide
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

export const EditorToolRail = memo(function EditorToolRail({ side, onGripPointerDown }: EditorToolRailProps) {
  const { locale, t } = useI18n()
  const renderKey = useWorkspace((state) => toolRailRenderKey(
    state.sessions.find((item) => item.document.id === state.activeId) ?? null
  ))
  const [shapeFlyoutOpen, setShapeFlyoutOpen] = useState(false)
  const [lineFlyoutOpen, setLineFlyoutOpen] = useState(false)
  const [selectionFlyoutOpen, setSelectionFlyoutOpen] = useState(false)
  const [fillFlyoutOpen, setFillFlyoutOpen] = useState(false)
  const [moveFlyoutOpen, setMoveFlyoutOpen] = useState(false)
  const [brushFlyoutOpen, setBrushFlyoutOpen] = useState(false)
  const [rememberedBrushTool, setRememberedBrushTool] = useState<ToolId>(() => {
    const saved = readStoredString('moonsprite.tool-rail.brush-tool')
    return saved === 'airbrush' || saved === 'smooth' ? saved : 'pencil'
  })
  const [shortcuts, setShortcuts] = useState(() => loadShortcutBindings())
  const state = useWorkspace.getState()
  const session = state.sessions.find((item) => item.document.id === state.activeId) ?? null
  const quickToolMatch = useQuickToolShortcut(shortcuts)

  useEffect(() => {
    const refreshShortcuts = (): void => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    return () => window.removeEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
  }, [])

  useEffect(() => {
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Element && !event.target.closest('.tool-slot')) {
        setShapeFlyoutOpen(false)
        setLineFlyoutOpen(false)
        setSelectionFlyoutOpen(false)
        setFillFlyoutOpen(false)
        setMoveFlyoutOpen(false)
        setBrushFlyoutOpen(false)
      }
    }
    const closeAll = (event: Event): void => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (target && target !== 'popover') return
      setShapeFlyoutOpen(false)
      setLineFlyoutOpen(false)
      setSelectionFlyoutOpen(false)
      setFillFlyoutOpen(false)
      setMoveFlyoutOpen(false)
      setBrushFlyoutOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside, true)
    window.addEventListener('moonsprite:close-dialog', closeAll)
    return () => {
      window.removeEventListener('pointerdown', closeOutside, true)
      window.removeEventListener('moonsprite:close-dialog', closeAll)
    }
  }, [])

  useEffect(() => {
    if (session?.tool !== 'shape') setShapeFlyoutOpen(false)
    if (session?.tool !== 'line') setLineFlyoutOpen(false)
    if (session?.tool !== 'selection') setSelectionFlyoutOpen(false)
    if (session?.tool !== 'fill') setFillFlyoutOpen(false)
    if (session?.tool !== 'move') setMoveFlyoutOpen(false)
    if (session?.tool !== 'pencil' && session?.tool !== 'airbrush' && session?.tool !== 'smooth') setBrushFlyoutOpen(false)
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.closest('.tool-rail')) focused.blur()
  }, [renderKey, session?.tool])

  useEffect(() => {
    const tool = session?.tool
    if (tool !== 'pencil' && tool !== 'airbrush' && tool !== 'smooth') return
    setRememberedBrushTool(tool)
    writeStoredString('moonsprite.tool-rail.brush-tool', tool)
  }, [session?.tool])

  if (!session) return null
  const workspace = useWorkspace.getState()
  const heldParts = currentHeldShortcutKeyParts()
  const heldModifiers = {
    ctrlKey: heldParts.has('Ctrl'),
    metaKey: heldParts.has('Win'),
    altKey: heldParts.has('Alt'),
    shiftKey: heldParts.has('Shift')
  }
  const lineConnectionHasPriority = Boolean(session.tool === 'eraser' ? session.lastEraserPoint : session.tool === 'pencil' ? session.lastPencilPoint : null)
    && modifierShortcutHeldByBindings(heldModifiers, shortcutBindingsFor(shortcuts, 'lineConnectionMode'), heldParts)
  const sizing = ['pencil', 'line', 'airbrush', 'eraser', 'smooth', 'liquify'].includes(session.tool)
    && modifierShortcutHeldByBindings(heldModifiers, shortcutBindingsFor(shortcuts, 'brushSizeAdjust'), heldParts)
  const quickTarget = sizing || (quickToolMatch?.id === 'tool.move.quick'
    && (!temporaryMoveToolAllowed(session.tool, session.moveKind) || lineConnectionHasPriority))
    ? null
    : quickToolMatch?.target ?? null
  const displaySession = applyQuickToolTarget(session, quickTarget)
  const allTools = toolDefinitions(locale)
  // Keep pencil-family tools in one rail slot; all definitions remain available
  // to the flyout, shortcut handling, and component-library previews.
  const tools = allTools.filter((tool) => tool.id !== 'airbrush' && tool.id !== 'smooth')
  const brushTools: Array<{ id: ToolId; icon: string; shortcutId: ShortcutId; label: string; description: string }> =
    (['pencil', 'airbrush', 'smooth'] as const).flatMap((id) => allTools.find((tool) => tool.id === id) ?? [])
  const selectionKinds = selectionKindDefinitions(locale)
  const shapeKinds = shapeKindDefinitions(locale)
  const lineKinds = lineKindDefinitions(locale)
  const fillKinds = fillKindDefinitions(locale)
  const moveKinds = moveKindDefinitions(locale)
  const fillKind = displaySession.fillKind ?? 'bucket'
  const flyoutTooltip = (label: string, description: string, shortcut: string) => <><strong>{label}</strong><span>{description}</span><small>{t('tools.shortcut', { shortcut: shortcut || t('common.unset') })}</small></>
  const shortcutFor = (id: ShortcutId): string => formatShortcutBindingsForLocale(shortcutBindingsFor(shortcuts, id), locale)
  const primaryShortcutFor = (id: ShortcutId): string => shortcutDisplayText(shortcutBindingsFor(shortcuts, id)[0] ?? '', locale)

  return <PerformanceProfiler id="EditorToolRail"><aside className={`tool-rail side-${side}`} aria-label={t('tools.toolbar')}>
    <span className="tool-icon-preload" aria-hidden="true">
      {ALL_EDITOR_TOOL_ICONS.map((source) => <PixelAssetIcon key={source} src={source} />)}
    </span>
    <button className="tool-rail-grip" type="button" aria-label={t('tools.moveToolbar')} title={t('tools.moveToolbarHint')} onPointerDown={onGripPointerDown}><PixelUtilityIcon kind="move" /></button>
    {tools.map((tool) => {
      const presentationToolId = tool.id === 'pencil' ? (['pencil', 'airbrush', 'smooth'].includes(displaySession.tool) ? displaySession.tool : rememberedBrushTool) : tool.id
      const presentation = activeToolPresentation(presentationToolId, displaySession.selectionKind, displaySession.shapeKind, locale, fillKind, displaySession.lineKind, displaySession.moveKind)
      const shortcut = primaryShortcutFor(presentation.shortcutId)
      const toolAvailable = isToolAvailableForSession(session, tool.id)
      const openToolFlyout = (): void => {
        if (!toolAvailable) return
        const target = isToolAvailableForSession(session, presentationToolId) ? presentationToolId : tool.id
        workspace.setTool(target)
        setBrushFlyoutOpen(tool.id === 'pencil' ? !brushFlyoutOpen : false)
        setShapeFlyoutOpen(tool.id === 'shape' ? !shapeFlyoutOpen : false)
        setLineFlyoutOpen(tool.id === 'line' ? !lineFlyoutOpen : false)
        setSelectionFlyoutOpen(tool.id === 'selection' ? !selectionFlyoutOpen : false)
        setFillFlyoutOpen(tool.id === 'fill' ? !fillFlyoutOpen : false)
        setMoveFlyoutOpen(tool.id === 'move' ? !moveFlyoutOpen : false)
      }
      const toolSelected = tool.id === 'pencil'
        ? displaySession.tool === 'pencil' || displaySession.tool === 'airbrush' || displaySession.tool === 'smooth'
        : displaySession.tool === tool.id
      return <div className="tool-slot" key={tool.id}>
        <Tooltip className="rail-tool-tooltip" content={flyoutTooltip(presentation.label, presentation.description, shortcutFor(presentation.shortcutId))}><button className={toolSelected ? 'selected' : ''} aria-label={presentation.label} disabled={!toolAvailable} onClick={openToolFlyout}>
          <PixelAssetIcon src={presentation.icon} className="rail-tool-icon" />
          <small>{shortcut}</small>
        </button></Tooltip>
        {tool.id === 'pencil' && brushFlyoutOpen && <div className="tool-flyout brush-flyout" role="dialog" aria-label={t('tools.toolbar')}>
          {brushTools.map((definition) => {
            const definitionAvailable = isToolAvailableForSession(session, definition.id)
            return <Tooltip key={definition.id} className="tool-flyout-tooltip" content={flyoutTooltip(definition.label, definition.description, shortcutFor(definition.shortcutId))}><button className={session.tool === definition.id ? 'selected' : ''} aria-label={definition.label} disabled={!definitionAvailable} onClick={() => { workspace.setTool(definition.id); setBrushFlyoutOpen(false) }}><PixelAssetIcon src={definition.icon} /></button></Tooltip>
          })}
        </div>}
        {tool.id === 'selection' && selectionFlyoutOpen && <div className="tool-flyout selection-flyout" role="dialog" aria-label={t('tools.chooseSelectionTool')}>
          {selectionKinds.map((definition) => <Tooltip key={definition.id} className="tool-flyout-tooltip" content={flyoutTooltip(definition.label, definition.description, shortcutFor(definition.shortcutId))}><button className={session.selectionKind === definition.id ? 'selected' : ''} aria-label={definition.label} onClick={() => { workspace.setSelectionKind(definition.id); setSelectionFlyoutOpen(false) }}><PixelAssetIcon src={SELECTION_KIND_ICONS[definition.id]} /></button></Tooltip>)}
        </div>}
        {tool.id === 'move' && moveFlyoutOpen && <div className="tool-flyout move-flyout" role="dialog" aria-label={t('tools.chooseMoveTool')}>
          {moveKinds.map((definition) => <Tooltip key={definition.id} className="tool-flyout-tooltip" content={flyoutTooltip(definition.label, definition.description, shortcutFor(definition.shortcutId))}><button className={session.moveKind === definition.id ? 'selected' : ''} aria-label={definition.label} onClick={() => { workspace.setTool('move'); workspace.setMoveKind(definition.id); setMoveFlyoutOpen(false) }}><PixelAssetIcon src={definition.icon} /></button></Tooltip>)}
        </div>}
        {tool.id === 'shape' && shapeFlyoutOpen && <div className="tool-flyout shape-flyout" role="dialog" aria-label={t('tools.chooseShape')}>
          {shapeKinds.map((definition) => <Tooltip key={definition.id} className="tool-flyout-tooltip" content={flyoutTooltip(definition.label, definition.description, t('tools.shapeShortcut', { shortcut: shortcutFor(definition.shortcutId) || t('common.unset') }))}><button className={session.shapeKind === definition.id ? 'selected' : ''} aria-label={definition.label} onClick={() => { workspace.setShapeKind(definition.id); setShapeFlyoutOpen(false) }}><PixelAssetIcon src={definition.icon} /></button></Tooltip>)}
        </div>}
        {tool.id === 'line' && lineFlyoutOpen && <div className="tool-flyout line-flyout" role="dialog" aria-label={t('tools.chooseLineTool')}>
          {lineKinds.map((definition) => <Tooltip key={definition.id} className="tool-flyout-tooltip" content={flyoutTooltip(definition.label, definition.description, shortcutFor(definition.shortcutId))}><button className={session.lineKind === definition.id ? 'selected' : ''} aria-label={definition.label} onClick={() => { workspace.setTool('line'); workspace.setLineKind(definition.id); setLineFlyoutOpen(false) }}><PixelAssetIcon src={definition.icon} /></button></Tooltip>)}
        </div>}
        {tool.id === 'fill' && fillFlyoutOpen && <div className="tool-flyout fill-flyout" role="dialog" aria-label={t('tools.chooseFillTool')}>
          {fillKinds.map((definition) => <Tooltip key={definition.id} className="tool-flyout-tooltip" content={flyoutTooltip(definition.label, definition.description, shortcutFor(definition.shortcutId))}><button className={fillKind === definition.id ? 'selected' : ''} aria-label={definition.label} onClick={() => { workspace.setFillKind(definition.id); setFillFlyoutOpen(false) }}><PixelAssetIcon src={FILL_KIND_ICONS[definition.id]} /></button></Tooltip>)}
        </div>}
      </div>
    })}
  </aside></PerformanceProfiler>
})
