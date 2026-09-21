import type { AppLocale } from '@/core/localization'
import type { QuickToolTarget } from '@/core/quick-tools'
import { RAIL_TOOL_IDS, RAIL_TOOL_TARGETS, type RailGroup, type RailToolId } from '@/core/tool-rail-preferences'
import { useWorkspace } from '@/store/workspace'
import { activeToolPresentation } from './editor-tools'

export function railToolCatalog(locale: AppLocale) {
  return RAIL_TOOL_IDS.map(id => {
    const target: QuickToolTarget = RAIL_TOOL_TARGETS[id]
    return { ...activeToolPresentation(target.tool, target.selectionKind ?? 'rectangle', target.shapeKind ?? 'rectangle-outline', locale,
      target.fillKind ?? 'bucket', target.lineKind ?? 'line', target.moveKind ?? 'move'), id, target }
  })
}
export function railGroupLabel(group: RailGroup, locale: AppLocale): string {
  return group.name || (locale === 'zh-CN' ? '工具集' : 'Tool set')
}
export function activateRailTool(id: RailToolId): void {
  const target: QuickToolTarget = RAIL_TOOL_TARGETS[id]
  const workspace = useWorkspace.getState()
  workspace.setTool(target.tool)
  if (target.selectionKind) workspace.setSelectionKind(target.selectionKind)
  else if (target.shapeKind) workspace.setShapeKind(target.shapeKind)
  else if (target.fillKind) workspace.setFillKind(target.fillKind)
  else {
    if (target.lineKind) workspace.setLineKind(target.lineKind)
    if (target.moveKind) workspace.setMoveKind(target.moveKind)
  }
}
