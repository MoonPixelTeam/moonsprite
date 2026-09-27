import { useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { useI18n } from '@/components/I18nProvider'
import { FormField } from '@/components/FormField'
import { TextInput } from '@/components/TextInput'
import { ThemedSelect } from '@/components/ThemedSelect'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { DEFAULT_TOOL_RAIL, groupPrimaryTool, moveRailEntry, normalizeToolRail, railEntryTools, restoreRailGroup, type RailGroup, type RailToolId, type ToolRailPreference } from '@/core/tool-rail-preferences'
import { PixelAssetIcon } from '@/components/app/editor-tools'
import { railGroupLabel, railToolCatalog } from '@/components/app/tool-rail-catalog'
import { ToolRailSlots } from '@/components/app/ToolRailSlots'
import './tool-rail-editor.css'

export function ToolRailLayoutEditor({ value, onChange }: { value: ToolRailPreference[]; onChange: (value: ToolRailPreference[]) => void }) {
  const { locale } = useI18n()
  const zh = locale === 'zh-CN'
  const copy = (cn: string, en: string) => zh ? cn : en
  const catalog = railToolCatalog(locale)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [preview, setPreview] = useState<RailToolId>()
  const [memory, setMemory] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const drop = useRef<HTMLElement | null>(null)
  const label = (id: RailToolId) => catalog.find(tool => tool.id === id)!.label
  const groups = value.filter((item): item is RailGroup => item.kind === 'group')
  const settingsGroup = groups.find(item => item.id === settingsId)
  const topEntry = value.find(item => item.id === selected)
  const group = topEntry?.kind === 'group' ? topEntry : null
  const present = new Set(value.flatMap(railEntryTools))
  const availableTools = catalog.filter(tool => !present.has(tool.id) && tool.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const move = (id: string, destination: string | null, index = Infinity) => {
    onChange(moveRailEntry(value, id, destination, index))
    if (destination && destination !== 'hidden') setExpanded(current => new Set(current).add(destination))
  }
  const updateGroup = (id: string, patch: Partial<RailGroup>) => {
    onChange(normalizeToolRail(value.map(item => item.id === id ? { ...item, ...patch } : item)))
  }
  const renderGroupSettings = (group: RailGroup) => <div className="rail-editor-group-settings">
        <FormField label={copy('分组名称', 'Group name')}><TextInput aria-label={copy('分组名称', 'Group name')} value={group.name} placeholder={railGroupLabel(group, locale)} maxLength={80} onChange={event => updateGroup(group.id, { name: event.target.value })} /></FormField>
        <FormField label={copy('点击分组时', 'Group activation')}><ThemedSelect value={group.behavior} label={copy('点击分组时', 'Group activation')} showOptionTooltips={false} groups={[{ label: copy('点击分组时', 'Group activation'), options: [
          { value: 'first', label: copy('第一个工具', 'First tool') }, { value: 'remember', label: copy('记住上次使用的工具（默认）', 'Remember last tool (default)') }, { value: 'fixed', label: copy('固定默认工具', 'Fixed default tool') }
        ] }]} onChange={behavior => updateGroup(group.id, { behavior })} /></FormField>
        {group.behavior === 'fixed' && !!group.tools.length && <FormField label={copy('默认工具', 'Default tool')}><ThemedSelect value={group.defaultTool} label={copy('默认工具', 'Default tool')} showOptionTooltips={false} groups={[{ label: copy('默认工具', 'Default tool'), options: group.tools.map(id => ({ value: id, label: label(id) })) }]} onChange={defaultTool => updateGroup(group.id, { defaultTool })} /></FormField>}
        {DEFAULT_TOOL_RAIL.some(item => item.id === group.id) && <button type="button" className="quiet-button" onClick={() => onChange(restoreRailGroup(value, group.id))}>{copy('恢复此组默认设置', 'Restore group defaults')}</button>}
      </div>
  const endDrag = () => { drop.current?.classList.remove('rail-drop-active'); drop.current = null; drag.current = null; setDragging(false) }
  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    setSelected(id)
    drag.current = { id, x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const dragMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current
    if (!current || Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5 && !current.moved) return
    current.moved = true
    setDragging(true)
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    const scroll = hit?.closest<HTMLElement>('.rail-editor-scroll')
    if (scroll) {
      const bounds = scroll.getBoundingClientRect()
      if (event.clientY < bounds.top + 24) scroll.scrollTop -= 16
      if (event.clientY > bounds.bottom - 24) scroll.scrollTop += 16
    }
    const target = hit?.closest<HTMLElement>('[data-rail-destination]') ?? null
    drop.current?.classList.remove('rail-drop-active')
    drop.current = target && root.current?.contains(target) ? target : null
    drop.current?.classList.add('rail-drop-active')
  }
  const finishDrag = () => {
    const current = drag.current
    const target = drop.current
    if (current?.moved && target) move(current.id, target.dataset.railDestination || null, Number(target.dataset.railIndex ?? Infinity))
    endDrag()
  }
  const handle = (id: string, name: string) => <button type="button" className="reorderable-list-handle rail-drag-handle" aria-label={`${copy('拖动', 'Drag')} ${name}`}
    onPointerDown={event => startDrag(event, id)} onPointerMove={dragMove} onPointerUp={finishDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}><PixelUtilityIcon kind="move" /></button>
  const gap = (destination: string | null, index: number) => <div className="rail-editor-gap" data-rail-destination={destination ?? ''} data-rail-index={index} />
  const row = (id: RailToolId, destination: string | null, index: number) => <div key={id}>
    {gap(destination, index)}<div data-rail-destination={destination ?? id} className={`rail-editor-row reorderable-list-row ${dragging && drag.current?.id === id ? 'dragging' : ''}`}>
      {handle(id, label(id))}<button type="button" className="quiet-button rail-editor-name" onClick={() => setSelected(id)}><PixelAssetIcon src={catalog.find(tool => tool.id === id)!.icon} /><span className="rail-editor-label">{label(id)}</span></button>
    </div>
  </div>
  return <div className={`rail-layout-editor ${dragging ? 'is-dragging' : ''}`} ref={root}>
    <p className="rail-editor-hint">{copy('从左侧添加工具，在中间调整顺序；将工具拖到左侧的隐藏区域即可隐藏，它仍可通过快捷键使用。点击分组查看组内工具。', 'Add tools from the left and arrange them in the middle. Drag a tool to the hidden area on the left to hide it; hidden tools remain available by shortcut. Click a group to see its tools.')}</p>
    <section className="rail-editor-available" data-rail-destination="hidden">
      <div className="rail-editor-heading"><strong>{copy('可用工具', 'Available tools')}</strong><small>{copy(`${availableTools.length}个`, `${availableTools.length} tools`)}</small></div>
      <div className="rail-editor-subheading"><TextInput value={query} aria-label={copy('搜索工具', 'Search tools')} placeholder={copy('搜索工具', 'Search tools')} onChange={event => setQuery(event.target.value)} /></div>
      <div className="rail-editor-scroll component-scrollbar">{availableTools.map(tool => <div className={`rail-editor-row reorderable-list-row ${dragging && drag.current?.id === tool.id ? 'dragging' : ''}`} key={tool.id}>
        {handle(tool.id, tool.label)}<button type="button" className="quiet-button rail-editor-name" aria-label={`${copy('添加', 'Add')} ${tool.label}`} onClick={() => { move(tool.id, group?.id ?? null); setSelected(tool.id) }}><PixelAssetIcon src={tool.icon} /><span className="rail-editor-label">{tool.label}</span><span className="rail-editor-trailing">＋</span></button>
      </div>)}{!availableTools.length && <p className="rail-editor-empty">{query ? copy('没有匹配的工具', 'No matching tools') : copy('所有工具都已加入。可在右侧展开分组，将工具移出或隐藏。', 'All tools have been added. Open a group on the right to ungroup or hide tools.')}</p>}</div>
      <small>{copy('拖到这里隐藏工具或整组', 'Drop here to hide tools or groups')}</small>
    </section>
    <section className="rail-editor-layout">
      <div className="rail-editor-heading"><strong>{copy('当前布局', 'Current layout')}</strong></div>
      <div className="rail-editor-subheading rail-editor-subheading-note">{copy('拖动排序 · 分组默认记住上次使用的工具', 'Drag to reorder · Groups remember the last tool by default')}</div>
      <div className="rail-editor-scroll component-scrollbar">{value.map((item, index) => item.kind === 'tool' ? row(item.id, null, index) : <div key={item.id}>
        {gap(null, index)}<div className={`rail-editor-group ${dragging && drag.current?.id === item.id ? 'dragging' : ''}`}>
          <div className="rail-editor-row rail-editor-group-row reorderable-list-row" data-rail-destination={item.id} data-rail-index={item.tools.length}>{handle(item.id, railGroupLabel(item, locale))}<button type="button" className="quiet-button rail-editor-name" aria-label={railGroupLabel(item, locale)} aria-expanded={expanded.has(item.id)} onClick={() => { setSelected(item.id); setExpanded(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next }) }}>{item.tools.length ? <PixelAssetIcon src={catalog.find(tool => tool.id === groupPrimaryTool(item, {}))!.icon} /> : <PixelUtilityIcon kind="plus" />}<span className="rail-editor-label">{railGroupLabel(item, locale)}</span><small className="rail-editor-trailing">{copy(`${item.tools.length}个`, `${item.tools.length} tools`)}</small></button>
          <button type="button" className="rail-group-settings-button" aria-label={`${copy('分组设置', 'Group settings')} ${railGroupLabel(item, locale)}`} onClick={() => setSettingsId(item.id)}><PixelUtilityIcon kind="properties" /></button></div>
          {expanded.has(item.id) && <div className="rail-editor-children">{item.tools.map((tool, childIndex) => row(tool, item.id, childIndex))}
          </div>}
        </div>
      </div>)}<div className="rail-editor-root-drop" data-rail-destination="" data-rail-index={value.length}>{copy('拖到这里独立显示', 'Drop here for a separate button')}</div></div>
    </section>
    <section className="rail-editor-preview" aria-label={copy('预览工具栏', 'Preview toolbar')}>
      <div className="tool-rail side-right"><ToolRailSlots expandOnClick layout={value} active={preview} memory={memory} onActivate={id => {
        setPreview(id)
        const owner = groups.find(item => item.tools.includes(id))
        if (owner) setMemory(current => ({ ...current, [owner.id]: id }))
      }} /></div>
    </section>
    {settingsGroup && createPortal(<div className="modal-backdrop modal-overlay-backdrop rail-group-settings-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setSettingsId(null) }}><ModalShell storageKey="tool-rail-group-settings" defaultWidth={400} minWidth={320} minHeight={220} resizable={false} role="dialog" aria-modal="true" className="rail-group-settings-dialog" aria-label={copy('分组设置', 'Group settings')} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setSettingsId(null) } }}>
      <DialogHeader title={copy('分组设置', 'Group settings')} onClose={() => setSettingsId(null)} closeLabel={copy('关闭', 'Close')} />
      {renderGroupSettings(settingsGroup)}
      <footer><button autoFocus type="button" className="primary-button" onClick={() => setSettingsId(null)}>{copy('完成', 'Done')}</button></footer>
    </ModalShell></div>, document.body)}
  </div>
}
