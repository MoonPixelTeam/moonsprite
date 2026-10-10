#!/usr/bin/env node

/**
 * AirAttackFX_0.moonsprite 性能分析脚本
 *
 * 项目特征:
 * - 160x192 像素画布
 * - 42 个图层，每层 100% 帧覆盖
 * - 297 帧动画
 * - 12,474 个 cel (每帧 42 个)
 * - 99% 的 cel 文件 < 100 bytes (几乎是空白)
 * - 仅 3% cel 链接率
 *
 * 测试目标:
 * 1. 动画播放帧率 (期望 60fps = 16.67ms/frame)
 * 2. 帧切换延迟
 * 3. Composite cache 命中率
 * 4. Animation layer source cache 效率
 * 5. 内存占用
 */

import { performance } from 'perf_hooks'
import fs from 'fs'

const PROJECT_PATH = 'C:\\Users\\23105\\DeskBox\\其他\\AirAttackFX_0.moonsprite'

console.log('=== AirAttackFX Performance Profile ===')
console.log('Project:', PROJECT_PATH)
console.log('Target: 60fps playback (16.67ms per frame)')
console.log('')

// 模拟关键数据
const FRAME_COUNT = 297
const LAYER_COUNT = 42
const CELS_PER_FRAME = 42
const CANVAS_WIDTH = 160
const CANVAS_HEIGHT = 192

console.log('=== Phase 1: Cel Loading Simulation ===')
console.log('模拟加载 12,474 个 cel (99% 空白)')

const celLoadStart = performance.now()
const celCache = new Map()

// 模拟 cel 加载: 99% 的 cel 是空的，应该很快
for (let i = 0; i < FRAME_COUNT * CELS_PER_FRAME; i++) {
  const isEmpty = Math.random() < 0.99
  const celData = isEmpty ? new Uint8ClampedArray(0) : new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4)
  celCache.set(`cel-${i}`, celData)
}

const celLoadDuration = performance.now() - celLoadStart
console.log('Cel 加载耗时:', celLoadDuration.toFixed(2), 'ms')
console.log('平均每 cel:', (celLoadDuration / (FRAME_COUNT * CELS_PER_FRAME)).toFixed(4), 'ms')
console.log('')

console.log('=== Phase 2: Frame Composite Simulation ===')
console.log('模拟合成 297 帧，每帧 42 层')

const frameTimes = []
for (let frameIdx = 0; frameIdx < FRAME_COUNT; frameIdx++) {
  const frameStart = performance.now()

  // 模拟图层合成
  const frameBuffer = new Uint8ClampedArray(CANVAS_WIDTH * CANVAS_HEIGHT * 4)

  for (let layerIdx = 0; layerIdx < LAYER_COUNT; layerIdx++) {
    const celIdx = frameIdx * CELS_PER_FRAME + layerIdx
    const celData = celCache.get(`cel-${celIdx}`)

    // 如果 cel 非空，模拟 alpha 混合
    if (celData && celData.length > 0) {
      for (let i = 0; i < frameBuffer.length; i += 4) {
        frameBuffer[i] = Math.min(255, frameBuffer[i] + celData[i])
        frameBuffer[i + 1] = Math.min(255, frameBuffer[i + 1] + celData[i + 1])
        frameBuffer[i + 2] = Math.min(255, frameBuffer[i + 2] + celData[i + 2])
        frameBuffer[i + 3] = 255
      }
    }
  }

  const frameDuration = performance.now() - frameStart
  frameTimes.push(frameDuration)
}

const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
const maxFrameTime = Math.max(...frameTimes)
const minFrameTime = Math.min(...frameTimes)
const targetFrameTime = 1000 / 60  // 16.67ms for 60fps

console.log('帧合成统计:')
console.log('  平均:', avgFrameTime.toFixed(2), 'ms/frame')
console.log('  最小:', minFrameTime.toFixed(2), 'ms')
console.log('  最大:', maxFrameTime.toFixed(2), 'ms')
console.log('  目标: 16.67 ms/frame (60fps)')
console.log('  达标率:', (frameTimes.filter(t => t <= targetFrameTime).length / frameTimes.length * 100).toFixed(1) + '%')
console.log('')

// 计算理论 FPS
const theoreticalFPS = 1000 / avgFrameTime
console.log('理论播放帧率:', theoreticalFPS.toFixed(1), 'fps')

if (theoreticalFPS < 60) {
  console.log('⚠️  性能瓶颈: 无法达到 60fps')
  console.log('   需要优化:', (60 / theoreticalFPS).toFixed(2) + 'x 速度提升')
} else {
  console.log('✅ 可以达到 60fps 播放')
}
console.log('')

console.log('=== Phase 3: Cache Efficiency Analysis ===')
console.log('分析问题场景:')
console.log('  - 42 层 × 297 帧 = 12,474 cel')
console.log('  - 仅 3% cel 链接，97% 都是独立的')
console.log('  - 每帧切换需要重新合成 42 层')
console.log('  - Cache miss 会导致大量重复计算')
console.log('')

const memoryPerFrame = CANVAS_WIDTH * CANVAS_HEIGHT * 4
const totalFrameMemory = memoryPerFrame * FRAME_COUNT
console.log('内存需求:')
console.log('  单帧大小:', (memoryPerFrame / 1024).toFixed(2), 'KB')
console.log('  缓存所有帧:', (totalFrameMemory / 1024 / 1024).toFixed(2), 'MB')
console.log('  默认 cache budget: 64 MB')
console.log('  可缓存帧数:', Math.floor(64 * 1024 * 1024 / memoryPerFrame), '帧')
console.log('')

console.log('=== Bottleneck Analysis ===')
const bottlenecks = []

if (theoreticalFPS < 60) {
  bottlenecks.push({
    issue: '帧合成速度不足',
    impact: `当前 ${theoreticalFPS.toFixed(1)} fps，需要 ${(avgFrameTime / targetFrameTime).toFixed(2)}x 提升`,
    suggestion: '优化 42 层合成逻辑，考虑 GPU 加速或分块合成'
  })
}

if (frameTimes.some(t => t > targetFrameTime * 2)) {
  bottlenecks.push({
    issue: '帧时间波动大',
    impact: `最大帧时间 ${maxFrameTime.toFixed(2)}ms 是平均的 ${(maxFrameTime / avgFrameTime).toFixed(2)}x`,
    suggestion: '存在偶发性卡顿，可能是 cache miss 或 GC'
  })
}

bottlenecks.push({
  issue: 'Cel 链接率低 (3%)',
  impact: '12,474 cel 中只有 372 个共享，97% 都是独立存储',
  suggestion: '检查是否可以增加 cel 复用，减少内存占用'
})

bottlenecks.push({
  issue: '99% cel 文件 < 100 bytes',
  impact: '大量空白 cel 仍然需要加载和处理',
  suggestion: '优化空 cel 的检测和跳过逻辑'
})

bottlenecks.forEach((b, i) => {
  console.log(`${i + 1}. ${b.issue}`)
  console.log(`   影响: ${b.impact}`)
  console.log(`   建议: ${b.suggestion}`)
  console.log('')
})

console.log('=== Next Steps ===')
console.log('1. 在实际应用中打开此项目，使用 Chrome DevTools Performance 录制')
console.log('2. 播放动画，观察实际帧率和瓶颈')
console.log('3. 使用 Memory Profiler 检查内存占用和泄漏')
console.log('4. 对比测试: 关闭某些图层，观察性能变化')
console.log('5. 收集真实数据后，针对性优化')
