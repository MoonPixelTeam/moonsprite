import { describe, expect, it } from 'vitest'
import { BudgetedStyleBlockMap, LayerStyleCacheBudget } from './layer-style-cache-budget'
import { DocumentCompositeCache } from './document-composite-cache'
import { compositeRegion } from './document-composite-region'
import { createDocument, createLayer, markLayerContentChanged, writeLayerColor } from './document-model'
import { createDefaultLayerStyles } from './layer-styles'
import { LayerStyleTileCache } from './layer-style-tile-cache'

const block = (bytes = 16) => ({ x: 0, y: 0, width: 2, height: 2, pixels: new Uint8ClampedArray(bytes) })
describe('shared style block byte budget', () => {
  it('evicts across owners by recent use, and accounts replacement/delete/clear', () => {
    const budget = new LayerStyleCacheBudget(32), a = new BudgetedStyleBlockMap(budget), b = new BudgetedStyleBlockMap(budget)
    a.set('a',block()); b.set('b',block()); a.get('a'); b.set('c',block())
    expect(b.has('b')).toBe(false); expect(a.has('a')).toBe(true)
    expect(budget.snapshot()).toMatchObject({ cachedBytes: 32, blockCount: 2, evictions: 1 })
    a.set('a',block(8)); expect(budget.snapshot().cachedBytes).toBe(24)
    a.delete('a'); expect(budget.snapshot().cachedBytes).toBe(16)
    budget.clear(); expect(b.size).toBe(0); expect(budget.snapshot().cachedBytes).toBe(0)
    b.set('huge',block(33)); expect(b.size).toBe(0)
    expect(() => new LayerStyleCacheBudget(NaN)).toThrow()
  })
  it('releases obsolete isolated keys and regenerates an evicted tile exactly', () => {
    const budget = new LayerStyleCacheBudget(16384), cache = new LayerStyleTileCache(budget)
    const owner = {}, styles = createDefaultLayerStyles(); styles.colorOverlay.enabled = true
    const read = (x: number, y: number) => ({ r: x & 255, g: y & 255, b: 80, a: 128 })
    const prepare = (key: string) => cache.prepare(owner,key,1,undefined,{x:0,y:0,width:256,height:256},styles,read,c=>c)
    const a = prepare('one'), first = a(1,2); a(70,2)
    expect(budget.snapshot().cachedBytes).toBe(16384); expect(a(1,2)).toEqual(first)
    const b = prepare('two'); expect(budget.snapshot().cachedBytes).toBe(0)
    expect(b(1,2)).toEqual(first)
  })
  it.each(['normal','group','multiply'] as const)('matches uncached %s pixels after eviction, edits, style change and movement', feature => {
    const doc = createDocument('bounded styles',192,128,'rgba',false)
    doc.layers.push(createLayer('second',192,128,'rgba'))
    const styles = createDefaultLayerStyles()
    styles.stroke = { ...styles.stroke, enabled:true,size:1,position:'both',followOpacity:true }
    styles.shadow = { ...styles.shadow, enabled:true,blur:1,offsetX:1,offsetY:-1 }
    styles.innerGlow = { ...styles.innerGlow, enabled:true,size:1 }
    for (const layer of doc.layers) {
      layer.layerStyles = structuredClone(styles); layer.opacity=.7
      for (let y=0;y<128;y++)for(let x=0;x<192;x++)writeLayerColor(doc,layer,y*192+x,{r:x%256,g:y*2,b:123,a:[0,1,63,128,254,255][(x+y)%6]})
      markLayerContentChanged(layer)
    }
    if(feature==='multiply')doc.layers[1].blendMode='multiply'
    if(feature==='group'){
      doc.groups.push({id:'g',name:'g',opacity:.6,blendMode:'normal',visible:true,locked:false,parentGroupId:null,layerStyles:structuredClone(styles)})
      for(const layer of doc.layers)layer.groupId='g'
    }
    const cache = new DocumentCompositeCache(12*16384)
    const check = (revision: number) => {
      for (const x of [2,70,140,2]){
        expect(compositeRegion(doc,x,17,1,1,cache,revision)).toEqual(compositeRegion(doc,x,17,1,1))
        expect(cache.styleCacheStats().cachedBytes).toBeLessThanOrEqual(12*16384)
      }
    }
    check(1)
    const dirty = {x:2,y:17,width:1,height:1}
    writeLayerColor(doc,doc.layers[0],17*192+2,{r:255,g:0,b:0,a:127});markLayerContentChanged(doc.layers[0])
    cache.invalidateStyleSources(doc,dirty,[doc.layers[0].id]); check(2)
    doc.layers[0].layerStyles!.shadow.offsetX=2; check(3)
    doc.layers[0].offsetX=5;cache.invalidateLayerPlacementCaches();check(4)
    cache.invalidateAll();expect(cache.styleCacheStats().cachedBytes).toBe(0)
  })
})
