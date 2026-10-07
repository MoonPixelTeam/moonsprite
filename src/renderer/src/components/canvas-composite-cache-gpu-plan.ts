import type { RasterLayer } from '@shared/types-layer'
import type { SelectionRect } from '@shared/types-selection'
import type { CompositeStackItem } from '@/core/document-composite-plan'
import { gpuBlendModeFor } from './canvas-composite-cache-surfaces'

export interface GpuMovePlan {
  bytes: number
  sources: Set<string>
  groups: Map<string, SelectionRect>
  runs: Map<string, SelectionRect>
}
export const gpuRunKey = (layers: readonly RasterLayer[]): string => layers.map(l => `${l.id}:${l.opacity}`).join(',')
export function gpuLayerRect(layer: RasterLayer, viewport: SelectionRect): SelectionRect | null {
  const x = Math.max(viewport.x, Math.floor(layer.offsetX)), y = Math.max(viewport.y, Math.floor(layer.offsetY))
  const right = Math.min(viewport.x + viewport.width, Math.ceil(layer.offsetX + layer.width))
  const bottom = Math.min(viewport.y + viewport.height, Math.ceil(layer.offsetY + layer.height))
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}
const union = (a: SelectionRect | null, b: SelectionRect | null): SelectionRect | null => {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x,b.x), y = Math.min(a.y,b.y)
  return { x, y, width: Math.max(a.x+a.width,b.x+b.width)-x, height: Math.max(a.y+a.height,b.y+b.height)-y }
}
/** No canvases or raster reads: reserve every retained surface before uploading. */
export function planGpuMovePreview(items: readonly CompositeStackItem[], moving: ReadonlySet<string>, viewport: SelectionRect, limit: number): GpuMovePlan | null {
  const plan: GpuMovePlan = { bytes: viewport.width * viewport.height * 4, sources: new Set(), groups: new Map(), runs: new Map() }
  if (viewport.width <= 0 || viewport.height <= 0 || plan.bytes > limit) return null
  let valid = true
  const addBytes = (bytes: number) => { plan.bytes += bytes; if (plan.bytes > limit) valid = false }
  const visit = (entries: readonly CompositeStackItem[]): SelectionRect | null => {
    let bounds: SelectionRect | null = null, runBounds: SelectionRect | null = null
    const run: RasterLayer[] = []
    const flush = () => {
      if (runBounds) { const key = gpuRunKey(run); if (!plan.runs.has(key)) { plan.runs.set(key,runBounds); addBytes(runBounds.width*runBounds.height*4) } }
      run.length=0;runBounds=null
    }
    for (const item of entries) {
      if (!valid) break
      if (item.kind === 'layer') {
        const layer=item.layer, isStatic=layer.blendMode==='normal'&&!moving.has(layer.id)
        if (!layer.visible || layer.opacity <= 0) { if (!isStatic) valid=false; continue }
        if (!gpuBlendModeFor(layer.blendMode)) { valid=false;break }
        const rect=gpuLayerRect(layer,viewport)
        if (!isStatic) flush()
        if (!rect) continue
        if (layer.width <= 0 || layer.height <= 0) { valid=false;break }
        if (!plan.sources.has(layer.id)) { plan.sources.add(layer.id);addBytes(layer.width*layer.height*4) }
        bounds=union(bounds,rect)
        if(isStatic){run.push(layer);runBounds=union(runBounds,rect)}
      } else {
        flush()
        if(!item.group.visible||item.group.opacity<=0)continue
        if(!gpuBlendModeFor(item.group.blendMode)){valid=false;break}
        const child=visit(item.children)
        bounds=union(bounds,child)
        if(child&&(item.group.blendMode!=='normal'||item.group.opacity!==1)){
          // Stable 64px capacities avoid recreating the Canvas2D context for
          // one-pixel boundary changes during a move. Padding is budgeted too.
          const capacity={...child,width:Math.ceil(child.width/64)*64,height:Math.ceil(child.height/64)*64}
          plan.groups.set(item.group.id,capacity);addBytes(capacity.width*capacity.height*4)
        }
      }
    }
    flush()
    return bounds
  }
  visit(items)
  return valid ? plan : null
}
