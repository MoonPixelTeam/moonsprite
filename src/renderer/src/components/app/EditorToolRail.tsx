import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ToolRailSide } from '@shared/types-workspace'
import { PerformanceProfiler } from '@/components/PerformanceProfiler'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { useI18n } from '@/components/I18nProvider'
import { toolRailRenderKey } from '@/components/app/app-render-keys'
import { readStoredString, writeStoredString } from '@/core/storage'
import { temporaryMoveToolAllowed } from '@/core/canvas-input'
import { loadShortcutBindings, modifierShortcutHeldByBindings, shortcutBindingsFor, shortcutDisplayText } from '@/core/shortcuts'
import { applyQuickToolTarget } from '@/core/quick-tools'
import { activeRailTool, isRailToolId, RAIL_TOOL_TARGETS, TOOL_RAIL_MEMORY_KEY } from '@/core/tool-rail-preferences'
import { currentHeldShortcutKeyParts, useQuickToolShortcut } from '@/components/useQuickToolShortcut'
import { useWorkspace } from '@/store/workspace'
import { isToolAvailableForSession } from '@/store/workspace-session'
import { loadEditorPreferences } from '@/core/file-preferences'
import { ALL_EDITOR_TOOL_ICONS, PixelAssetIcon } from './editor-tools'
import { activateRailTool } from './tool-rail-catalog'
import { ToolRailSlots } from './ToolRailSlots'

interface EditorToolRailProps {
  side: ToolRailSide
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}
function loadGroupMemory(): Record<string, string> {
  const legacy = readStoredString('moonsprite.tool-rail.brush-tool')
  const fallback: Record<string, string> = isRailToolId(legacy) ? { 'group:pencil': legacy } : {}
  try {
    const value: unknown = JSON.parse(readStoredString(TOOL_RAIL_MEMORY_KEY) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
    return Object.fromEntries(Object.entries(value).filter(([key, id]) => key.startsWith('group:') && isRailToolId(id)))
  } catch { return fallback }
}
export const EditorToolRail = memo(function EditorToolRail({ side, onGripPointerDown }: EditorToolRailProps) {
  const { locale, t } = useI18n()
  const renderKey = useWorkspace(state => toolRailRenderKey(state.sessions.find(item => item.document.id === state.activeId) ?? null))
  const [toolRail, setToolRail] = useState(() => loadEditorPreferences().toolRail)
  const [memory, setMemory] = useState(loadGroupMemory)
  const [shortcuts, setShortcuts] = useState(loadShortcutBindings)
  const quickToolMatch = useQuickToolShortcut(shortcuts)
  const state = useWorkspace.getState()
  const session = state.sessions.find(item => item.document.id === state.activeId) ?? null
  const actual = session ? activeRailTool(session) : undefined
  useEffect(() => {
    const refresh = () => setToolRail(loadEditorPreferences().toolRail)
    const refreshShortcuts = () => setShortcuts(loadShortcutBindings())
    window.addEventListener('moonsprite:preferences-changed', refresh)
    window.addEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    return () => {
      window.removeEventListener('moonsprite:preferences-changed', refresh)
      window.removeEventListener('moonsprite:shortcuts-changed', refreshShortcuts)
    }
  }, [])
  useEffect(() => {
    const group = toolRail.find(item => item.kind === 'group' && actual && item.tools.includes(actual))
    if (!actual || group?.kind !== 'group' || group.behavior !== 'remember' || memory[group.id] === actual) return
    const next = { ...memory, [group.id]: actual }
    setMemory(next)
    writeStoredString(TOOL_RAIL_MEMORY_KEY, JSON.stringify(next))
  }, [actual, toolRail, memory])
  useEffect(() => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.closest('.tool-rail')) focused.blur()
  }, [renderKey])
  if (!session) return null
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
    && (!temporaryMoveToolAllowed(session.tool, session.moveKind, session.selectionKind) || lineConnectionHasPriority))
    ? null
    : quickToolMatch?.target ?? null
  const displaySession = applyQuickToolTarget(session, quickTarget)
  return <PerformanceProfiler id="EditorToolRail"><aside className={`tool-rail side-${side}`} aria-label={t('tools.toolbar')}>
    <span className="tool-icon-preload" aria-hidden="true">{ALL_EDITOR_TOOL_ICONS.map(source => <PixelAssetIcon key={source} src={source} />)}</span>
    <button className="tool-rail-grip" type="button" aria-label={t('tools.moveToolbar')} onPointerDown={onGripPointerDown}><PixelUtilityIcon kind="move" /></button>
    <ToolRailSlots layout={toolRail} active={activeRailTool(displaySession)} memory={memory} onActivate={activateRailTool}
      available={id => isToolAvailableForSession(session, RAIL_TOOL_TARGETS[id].tool)}
      shortcut={id => shortcutDisplayText(shortcutBindingsFor(shortcuts, id)[0] ?? '', locale)} />
  </aside></PerformanceProfiler>
})
