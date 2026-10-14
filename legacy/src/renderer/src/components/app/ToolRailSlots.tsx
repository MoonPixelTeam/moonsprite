import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { Tooltip } from '@/components/Tooltip'
import { groupPrimaryTool, railEntryTools, type RailToolId, type ToolRailPreference } from '@/core/tool-rail-preferences'
import { type ShortcutId } from '@/core/shortcuts'
import { PixelAssetIcon } from './editor-tools'
import { railGroupLabel, railToolCatalog } from './tool-rail-catalog'
import './tool-rail-layout.css'

interface ToolRailSlotsProps {
  layout: ToolRailPreference[]; active?: RailToolId; memory: Record<string, string>
  onActivate: (id: RailToolId) => void
  available?: (id: RailToolId) => boolean
  shortcut?: (id: ShortcutId) => string
  expandOnClick?: boolean
}
export function ToolRailSlots(props: ToolRailSlotsProps) {
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null)
    }
    const close = (event: Event) => {
      const target = (event as CustomEvent<{ target?: string }>).detail?.target
      if (!target || target === 'popover') setOpen(null)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(null) }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('moonsprite:close-dialog', close)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('moonsprite:close-dialog', close)
      window.removeEventListener('keydown', escape)
    }
  }, [])
  return <div className="tool-rail-slots component-scrollbar" ref={root} onScroll={() => setOpen(null)}>{props.layout.map(entry => <RailSlot key={entry.id} {...props} entry={entry}
    open={open === entry.id} toggle={() => setOpen(open === entry.id ? null : entry.id)} close={() => setOpen(null)} />)}</div>
}
function RailSlot({ entry, active, memory, onActivate, available = () => true, shortcut = () => '', expandOnClick = true, open, toggle, close }: ToolRailSlotsProps & {
  entry: ToolRailPreference; open: boolean; toggle: () => void; close: () => void
}) {
  const { locale, t } = useI18n()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const held = useRef(false)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const flyout = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const cancel = () => { clearTimeout(timer.current); timer.current = undefined }
  useEffect(() => cancel, [])
  useLayoutEffect(() => {
    if (!open || !flyout.current || !slot.current) return
    const el = flyout.current
    // The top layer keeps flyouts outside a scrollable rail without moving their DOM/focus ownership.
    if (typeof el.showPopover === 'function') el.showPopover()
    else el.removeAttribute('popover')
    const rect = el.getBoundingClientRect()
    const anchor = slot.current.getBoundingClientRect()
    const rail = slot.current.closest('.tool-rail')
    const horizontal = rail?.matches('.side-top, .side-bottom')
    const left = horizontal ? anchor.left : rail?.matches('.side-right') ? anchor.left - rect.width - 4 : anchor.right + 4
    const top = horizontal ? rail?.matches('.side-bottom') ? anchor.top - rect.height - 4 : anchor.bottom + 4 : anchor.top
    el.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`
    el.style.top = `${Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))}px`
  }, [open])
  const catalog = railToolCatalog(locale)
  const ids = railEntryTools(entry)
  let primary = entry.kind === 'tool' ? entry.id : groupPrimaryTool(entry, memory)
  if (entry.kind === 'group' && entry.behavior === 'remember' && active && ids.includes(active)) primary = active
  // A remembered tool may be unavailable on a mask/tilemap; keep the group usable.
  if (primary && !available(primary)) primary = ids.find(available) ?? primary
  const tool = catalog.find(item => item.id === primary)
  if (!tool) return null
  const choose = (id: RailToolId) => { onActivate(id); close() }
  const groupLabel = entry.kind === 'group' ? railGroupLabel(entry, locale) : tool.label
  return <div className="tool-slot" ref={slot}>
    <Tooltip className="rail-tool-tooltip" content={<><strong>{tool.label}</strong><span>{tool.description}</span>{entry.kind === 'group' && <span>{locale === 'zh-CN' ? '长按或右键展开工具组' : 'Hold or right-click to open the group'}</span>}<small>{t('tools.shortcut', { shortcut: shortcut(tool.shortcutId) || t('common.unset') })}</small></>}>
      <button type="button" className={active && ids.includes(active) ? 'selected' : ''} aria-label={tool.label} disabled={!available(tool.id)} aria-haspopup={entry.kind === 'group' ? 'dialog' : undefined} aria-expanded={entry.kind === 'group' ? open : undefined}
        onContextMenu={event => { if (entry.kind === 'group') { event.preventDefault(); toggle() } }}
        onKeyDown={event => { if (entry.kind === 'group' && (event.key === 'ArrowDown' || event.key === 'F4')) { event.preventDefault(); toggle() } }}
        onPointerDown={event => {
          if (event.button !== 0) return
          held.current = false
          pressOrigin.current = { x: event.clientX, y: event.clientY }
          if (entry.kind === 'group') timer.current = setTimeout(() => { held.current = true; toggle() }, 400)
        }} onPointerMove={event => { const origin = pressOrigin.current; if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) cancel() }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
        onClick={() => { if (held.current) { held.current = false; return } if (expandOnClick && entry.kind === 'group') { onActivate(tool.id); toggle(); return } choose(tool.id) }}>
        <PixelAssetIcon src={tool.icon} className="rail-tool-icon" /><small>{shortcut(tool.shortcutId)}</small>
      </button>
    </Tooltip>
    {open && entry.kind === 'group' && <div className="tool-flyout custom-tool-flyout component-scrollbar" style={{ gridTemplateColumns: `repeat(${ids.length}, var(--tool-rail-button-size))`, gridTemplateRows: 'var(--tool-rail-button-size)' }} popover="manual" ref={flyout} role="dialog" aria-label={groupLabel}>
      {ids.map(id => {
        const child = catalog.find(item => item.id === id)!
        return <Tooltip key={id} className="tool-flyout-tooltip" content={<><strong>{child.label}</strong><span>{child.description}</span></>}>
          <button type="button" aria-label={child.label} className={active === id ? 'selected' : ''} disabled={!available(id)} onClick={() => choose(id)}><PixelAssetIcon src={child.icon} /></button>
        </Tooltip>
      })}
    </div>}
  </div>
}
