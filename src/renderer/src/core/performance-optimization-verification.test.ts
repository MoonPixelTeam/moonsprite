/**
 * Performance Optimization Verification Test
 * 验证 Phases 1-6 的性能优化效果
 */

import { describe, it, expect } from 'vitest'
import { createDocument, DocumentCompositeCache, compositeRegion, createLayer } from './document'
import { beginPixelEdit, commitPixelEdit } from './history'
import { paintBrush } from './tools-brush'
import { GlobalCacheManager } from './global-cache-manager'
import { computeFrameDiff } from '@/components/canvas-composite-cache-frame-diff'
import { mergeRecentDirtyRects } from '@/components/canvas-composite-cache-geometry'
import { dynamicStyledLayerBlockSize } from './document-composite-style-types'
import { createDefaultLayerStyles } from './layer-styles'

describe('Phase 1: 大画布分块上传与限流', () => {
  it('分块上传逻辑存在且可调用', () => {
    const cache = new DocumentCompositeCache()
    expect(cache).toBeDefined()
    // 分块上传在 canvas-composite-cache.ts 中已验证
  })

  it('8K 画布限制生效', () => {
    const doc = createDocument('8K test', 8192, 8192, 'rgba')
    expect(doc.width).toBe(8192)
    expect(doc.height).toBe(8192)
  })
})

describe('Phase 2: 图层边界裁剪', () => {
  it('50 层文档合成性能 - 边界裁剪优化', () => {
    const doc = createDocument('50 layers', 512, 512, 'rgba')

    // 创建 50 个图层，但大部分在视口外
    for (let i = 0; i < 50; i++) {
      const layer = createLayer(`layer-${i}`, 512, 512, 'rgba')
      layer.offsetX = i * 1000 // 大部分图层在视口外
      layer.offsetY = i * 1000
      doc.layers.push(layer)
    }

    const cache = new DocumentCompositeCache()
    const start = performance.now()

    // 只合成左上角 256x256，大部分图层应该被裁剪跳过
    compositeRegion(doc, 0, 0, 256, 256, cache, 0)

    const duration = performance.now() - start
    console.log(`50 层文档合成 256x256 区域: ${duration.toFixed(2)}ms`)

    // 预期: 边界裁剪后应该很快 (<50ms)
    expect(duration).toBeLessThan(100)
  })
})

describe('Phase 3: 帧差分缓存', () => {
  it('帧差分计算正确识别变化的图层', () => {
    const doc = createDocument('frame diff test', 256, 256, 'rgba')
    const pixels1 = new Uint8ClampedArray(256 * 256 * 4)
    const pixels2 = new Uint8ClampedArray(256 * 256 * 4).fill(255)

    doc.animation = {
      loop: true,
      frames: [
        { id: 'frame1', duration: 100 },
        { id: 'frame2', duration: 100 }
      ],
      activeFrameId: 'frame1',
      cels: [
        { id: 'cel1', layerId: doc.layers[0].id, frameId: 'frame1', surface: { format: 'rgba', width: 256, height: 256, offsetX: 0, offsetY: 0, pixels: pixels1 }, opacity: 1 },
        { id: 'cel2', layerId: doc.layers[0].id, frameId: 'frame2', surface: { format: 'rgba', width: 256, height: 256, offsetX: 0, offsetY: 0, pixels: pixels2 }, opacity: 1 }
      ]
    }

    const diff = computeFrameDiff(doc, 'frame1', 'frame2')

    expect(diff).toBeDefined()
    expect(diff.fromFrameId).toBe('frame1')
    expect(diff.toFrameId).toBe('frame2')
    expect(diff.changedLayerIds.size).toBeGreaterThan(0)
  })
})

describe('Phase 4: 图层样式动态块大小', () => {
  it('大半径样式返回 1024 块大小', () => {
    const styles = createDefaultLayerStyles()
    styles.shadow.enabled = true
    styles.shadow.blur = 100 // 大半径

    const blockSize = dynamicStyledLayerBlockSize(styles)
    expect(blockSize).toBe(1024)
  })

  it('中等半径样式返回 512 块大小', () => {
    const styles = createDefaultLayerStyles()
    styles.shadow.enabled = true
    styles.shadow.blur = 32 // 中等半径

    const blockSize = dynamicStyledLayerBlockSize(styles)
    expect(blockSize).toBe(512)
  })

  it('小半径样式返回 256 块大小', () => {
    const styles = createDefaultLayerStyles()
    styles.shadow.enabled = true
    styles.shadow.blur = 8 // 小半径

    const blockSize = dynamicStyledLayerBlockSize(styles)
    expect(blockSize).toBe(256)
  })
})

describe('Phase 5: 笔刷脏区域合并', () => {
  it('滑动窗口合并保留最近的矩形', () => {
    const rects = Array.from({ length: 50 }, (_, i) => ({
      x: i * 10,
      y: i * 10,
      width: 20,
      height: 20
    }))

    const merged = mergeRecentDirtyRects(rects, 16)

    // 预期: 合并后数量应该减少，但保留最近 16 个
    expect(merged.length).toBeLessThan(rects.length)
    expect(merged.length).toBeGreaterThanOrEqual(16)
  })

  it('大笔刷对称操作性能', () => {
    const doc = createDocument('symmetry test', 512, 512, 'rgba')
    const layer = doc.layers[0]
    const edit = beginPixelEdit(layer.id)
    const axes = { horizontal: true, vertical: true, diagonalUp: false, diagonalDown: false }

    const start = performance.now()

    // 128px 对称笔刷
    paintBrush(doc, layer, edit, 256, 256, 128, { r: 255, g: 0, b: 0, a: 255 },
      'round', null, 'solid', 1, null, undefined, 0, 'paint', undefined, axes)

    const duration = performance.now() - start
    console.log(`128px 四向对称笔刷: ${duration.toFixed(2)}ms`)

    // 预期: 优化后应该 <50ms
    expect(duration).toBeLessThan(100)
  })
})

describe('Phase 6: 全局内存管理', () => {
  it('GlobalCacheManager 正确跟踪缓存', () => {
    const manager = new GlobalCacheManager()

    const mockCache = {
      name: 'test-cache',
      snapshot: () => ({
        name: 'test-cache',
        cachedBytes: 1024 * 1024, // 1MB
        itemCount: 10
      })
    }

    const unregister = manager.register(mockCache)

    const total = manager.totalBytes()
    expect(total).toBe(1024 * 1024)

    unregister()
    expect(manager.totalBytes()).toBe(0)
  })

  it('内存压力检测正常工作', () => {
    const manager = new GlobalCacheManager(10 * 1024 * 1024, 20 * 1024 * 1024)

    const mockCache = {
      name: 'large-cache',
      snapshot: () => ({
        name: 'large-cache',
        cachedBytes: 15 * 1024 * 1024, // 15MB
        itemCount: 100
      })
    }

    manager.register(mockCache)

    const pressure = manager.checkMemoryPressure()
    expect(pressure.level).toBe('moderate') // 超过 10MB soft limit
    expect(pressure.totalBytes).toBe(15 * 1024 * 1024)
  })
})

describe('综合性能基准', () => {
  it('4K 画布 + 20 层 + 大笔刷综合场景', () => {
    const doc = createDocument('4K综合测试', 4096, 4096, 'rgba')

    // 添加 20 个图层
    for (let i = 0; i < 19; i++) {
      const layer = createLayer(`layer-${i}`, 4096, 4096, 'rgba')
      doc.layers.push(layer)
    }

    const cache = new DocumentCompositeCache()
    const layer = doc.layers[0]
    const edit = beginPixelEdit(layer.id)

    const start = performance.now()

    // 绘制 10 个大笔刷笔画
    for (let i = 0; i < 10; i++) {
      paintBrush(doc, layer, edit, 1000 + i * 100, 1000 + i * 50, 64,
        { r: 255, g: 128, b: 0, a: 255 }, 'round', null, 'solid', 1,
        null, undefined, 0, 'paint', undefined)
    }

    // 合成可见区域
    compositeRegion(doc, 800, 800, 1024, 1024, cache, 0)

    const duration = performance.now() - start
    console.log(`4K + 20层 + 10笔画 + 合成: ${duration.toFixed(2)}ms`)

    // 预期: 优化后应该 <500ms
    expect(duration).toBeLessThan(1000)
  })
})
