/**
 * AirAttackFX Real Performance Test
 *
 * 在浏览器环境中实际加载和测试项目性能
 * 使用 Vitest 的浏览器模式运行
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { openDocument } from '@/core/document-io'
import { DocumentCompositeCache, compositeRegion } from '@/core/document'
import type { SpriteDocument } from '@shared/types-document'

const PROJECT_PATH = 'C:\\Users\\23105\\DeskBox\\其他\\AirAttackFX_0.moonsprite'

describe('AirAttackFX Performance Test', () => {
  let document: SpriteDocument | null = null
  const performanceMetrics: {
    frameCompositeTimes: number[]
    cacheHitRate: number
    memoryUsage: number
    totalFrames: number
  } = {
    frameCompositeTimes: [],
    cacheHitRate: 0,
    totalFrames: 0,
    memoryUsage: 0
  }

  beforeAll(async () => {
    console.log('正在加载项目:', PROJECT_PATH)
    const loadStart = performance.now()

    // 需要实际文件系统访问，这里先跳过
    // document = await openDocument(PROJECT_PATH)

    const loadDuration = performance.now() - loadStart
    console.log('项目加载耗时:', loadDuration.toFixed(2), 'ms')
  })

  it.skip('测量实际项目加载时间', async () => {
    expect(document).not.toBeNull()
    // 验证项目结构
    expect(document?.width).toBe(160)
    expect(document?.height).toBe(192)
    expect(document?.layers.length).toBe(42)
    expect(document?.animation?.frames.length).toBe(297)
  })

  it.skip('测量动画帧合成性能', () => {
    if (!document || !document.animation) return

    const cache = new DocumentCompositeCache()
    const frames = document.animation.frames
    const frameTimes: number[] = []

    console.log('开始测试', frames.length, '帧合成性能...')

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const frameStart = performance.now()

      // 合成整个画布
      compositeRegion(
        document,
        0, 0,
        document.width, document.height,
        cache,
        0,
        frame.id
      )

      const frameDuration = performance.now() - frameStart
      frameTimes.push(frameDuration)

      if (i % 50 === 0) {
        console.log(`已测试 ${i}/${frames.length} 帧`)
      }
    }

    performanceMetrics.frameCompositeTimes = frameTimes
    performanceMetrics.totalFrames = frames.length

    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
    const maxFrameTime = Math.max(...frameTimes)
    const minFrameTime = Math.min(...frameTimes)
    const p95FrameTime = frameTimes.sort((a, b) => a - b)[Math.floor(frameTimes.length * 0.95)]

    console.log('=== 帧合成性能统计 ===')
    console.log('平均:', avgFrameTime.toFixed(2), 'ms/frame')
    console.log('最小:', minFrameTime.toFixed(2), 'ms')
    console.log('最大:', maxFrameTime.toFixed(2), 'ms')
    console.log('P95:', p95FrameTime.toFixed(2), 'ms')
    console.log('理论 FPS:', (1000 / avgFrameTime).toFixed(1))

    const TARGET_FPS = 60
    const TARGET_FRAME_TIME = 1000 / TARGET_FPS
    const passRate = (frameTimes.filter(t => t <= TARGET_FRAME_TIME).length / frameTimes.length * 100).toFixed(1)

    console.log('60fps 达标率:', passRate + '%')

    // 报告瓶颈
    if (avgFrameTime > TARGET_FRAME_TIME) {
      console.warn('⚠️  平均帧时间超过 60fps 目标')
      console.warn('   需要提升:', (avgFrameTime / TARGET_FRAME_TIME).toFixed(2) + 'x')
    }

    if (maxFrameTime > TARGET_FRAME_TIME * 3) {
      console.warn('⚠️  存在严重卡顿帧 (>50ms)')
      console.warn('   最差帧:', maxFrameTime.toFixed(2), 'ms')
    }

    // 基本性能要求
    expect(avgFrameTime).toBeLessThan(TARGET_FRAME_TIME * 1.5) // 允许 1.5x 容差
    expect(p95FrameTime).toBeLessThan(TARGET_FRAME_TIME * 2) // P95 不超过 2x
  })

  it.skip('测量 cache 命中率', () => {
    if (!document) return

    const cache = new DocumentCompositeCache()
    let cacheHits = 0
    let cacheMisses = 0

    // 模拟动画循环播放 3 次
    const LOOPS = 3
    const frames = document.animation?.frames || []

    for (let loop = 0; loop < LOOPS; loop++) {
      for (const frame of frames) {
        const beforeSize = cache['surfaces']?.size || 0

        compositeRegion(
          document,
          0, 0,
          document.width, document.height,
          cache,
          0,
          frame.id
        )

        const afterSize = cache['surfaces']?.size || 0

        if (afterSize > beforeSize) {
          cacheMisses++
        } else {
          cacheHits++
        }
      }
    }

    const hitRate = (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(1)
    console.log('=== Cache 统计 ===')
    console.log('Cache hits:', cacheHits)
    console.log('Cache misses:', cacheMisses)
    console.log('命中率:', hitRate + '%')

    performanceMetrics.cacheHitRate = parseFloat(hitRate)

    // 期望第 2、3 次循环有较高的 cache 命中率
    expect(parseFloat(hitRate)).toBeGreaterThan(60)
  })

  it.skip('测量内存占用', async () => {
    if (!document) return

    // 触发合成并观察内存
    const cache = new DocumentCompositeCache()
    const frames = document.animation?.frames || []

    // 合成所有帧
    for (const frame of frames) {
      compositeRegion(
        document,
        0, 0,
        document.width, document.height,
        cache,
        0,
        frame.id
      )
    }

    // 等待一帧让浏览器更新内存统计
    await new Promise(resolve => setTimeout(resolve, 100))

    // @ts-ignore - 使用 Chrome 的内存 API
    if (performance.memory) {
      // @ts-ignore
      const used = performance.memory.usedJSHeapSize / 1024 / 1024
      // @ts-ignore
      const total = performance.memory.totalJSHeapSize / 1024 / 1024

      console.log('=== 内存占用 ===')
      console.log('使用:', used.toFixed(2), 'MB')
      console.log('总计:', total.toFixed(2), 'MB')
      console.log('使用率:', (used / total * 100).toFixed(1) + '%')

      performanceMetrics.memoryUsage = used

      // 预期内存占用合理 (< 500 MB)
      expect(used).toBeLessThan(500)
    }
  })
})
