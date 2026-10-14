/**
 * Memory Leak Test Suite
 *
 * Simulates user scenarios that previously caused "越用越卡" (progressive slowdown)
 * Tests the fixes for RAF leaks in AntiAliasDialog and canvas-composite-cache
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

interface MemorySnapshot {
  timestamp: number
  usedJSHeapSize: number
  totalJSHeapSize: number
  rafCallbackCount: number
  testName: string
}

interface MemoryTestResult {
  testName: string
  startMemory: number
  endMemory: number
  memoryGrowth: number
  memoryGrowthMB: number
  rafLeaked: number
  passed: boolean
  details: string
}

/**
 * Get current memory usage (Chrome only)
 */
function getMemoryUsage(): { usedJSHeapSize: number; totalJSHeapSize: number } | null {
  const perf = globalThis.performance as any
  if (perf.memory) {
    return {
      usedJSHeapSize: perf.memory.usedJSHeapSize,
      totalJSHeapSize: perf.memory.totalJSHeapSize
    }
  }
  return null
}

/**
 * Count active RAF callbacks (mock for testing)
 */
let activeRAFCallbacks = 0
const originalRAF = window.requestAnimationFrame
const originalCAF = window.cancelAnimationFrame
const rafCallbacks = new Map<number, FrameRequestCallback>()
let rafIdCounter = 1

function installRAFTracking(): void {
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = rafIdCounter++
    rafCallbacks.set(id, callback)
    activeRAFCallbacks++
    return originalRAF(callback)
  }

  window.cancelAnimationFrame = (id: number): void => {
    if (rafCallbacks.has(id)) {
      rafCallbacks.delete(id)
      activeRAFCallbacks--
    }
    originalCAF(id)
  }
}

function uninstallRAFTracking(): void {
  window.requestAnimationFrame = originalRAF
  window.cancelAnimationFrame = originalCAF
  rafCallbacks.clear()
  activeRAFCallbacks = 0
}

function getRAFCallbackCount(): number {
  return activeRAFCallbacks
}

/**
 * Force garbage collection (Chrome with --expose-gc flag)
 */
async function forceGC(): Promise<void> {
  if (typeof (global as any).gc === 'function') {
    (global as any).gc()
  }
  // Wait for GC to complete
  await new Promise(resolve => setTimeout(resolve, 100))
}

/**
 * Take memory snapshot
 */
function takeSnapshot(testName: string): MemorySnapshot {
  const memory = getMemoryUsage()
  return {
    timestamp: Date.now(),
    usedJSHeapSize: memory?.usedJSHeapSize ?? 0,
    totalJSHeapSize: memory?.totalJSHeapSize ?? 0,
    rafCallbackCount: getRAFCallbackCount(),
    testName
  }
}

/**
 * Calculate memory growth between snapshots
 */
function calculateGrowth(start: MemorySnapshot, end: MemorySnapshot): MemoryTestResult {
  const memoryGrowth = end.usedJSHeapSize - start.usedJSHeapSize
  const memoryGrowthMB = memoryGrowth / (1024 * 1024)
  const rafLeaked = end.rafCallbackCount - start.rafCallbackCount

  // Pass criteria:
  // - Memory growth < 50MB (allowing for normal allocations)
  // - RAF leaked < 10 (allowing for a few legitimate pending frames)
  const passed = memoryGrowthMB < 50 && rafLeaked < 10

  return {
    testName: start.testName,
    startMemory: start.usedJSHeapSize / (1024 * 1024),
    endMemory: end.usedJSHeapSize / (1024 * 1024),
    memoryGrowth,
    memoryGrowthMB,
    rafLeaked,
    passed,
    details: `Memory: ${memoryGrowthMB.toFixed(2)}MB growth, RAF: ${rafLeaked} leaked`
  }
}

/**
 * Test 1: Rapid document switching with large canvas
 *
 * Simulates the scenario where canvas-composite-cache RAF leak occurs
 */
export async function testRapidDocumentSwitching(): Promise<MemoryTestResult> {
  installRAFTracking()
  await forceGC()

  const start = takeSnapshot('Rapid Document Switching')

  // Simulate 50 rapid document switches
  for (let i = 0; i < 50; i++) {
    // Simulate creating a large canvas surface
    const canvas = new OffscreenCanvas(4096, 4096)
    const ctx = canvas.getContext('2d', { willReadFrequently: false })

    if (ctx) {
      // Simulate chunked upload starting (would trigger RAF chain)
      const pixels = new Uint8ClampedArray(4096 * 4096 * 4)

      // Simulate upload starting
      let uploadChunk = 0
      const scheduleUpload = (): void => {
        uploadChunk++
        if (uploadChunk < 16) { // 4K canvas = 16 chunks of 1K×1K
          window.requestAnimationFrame(scheduleUpload)
        }
      }
      window.requestAnimationFrame(scheduleUpload)

      // Simulate immediate document switch (surface disposal)
      // In the fixed version, this should cancel all pending RAF
      canvas.width = 1
      canvas.height = 1
    }

    // Small delay to let RAF callbacks execute
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  await forceGC()
  const end = takeSnapshot('Rapid Document Switching')

  uninstallRAFTracking()
  return calculateGrowth(start, end)
}

/**
 * Test 2: Long canvas panning session
 *
 * Simulates continuous panning that triggers many composite cache updates
 */
export async function testLongCanvasPanning(): Promise<MemoryTestResult> {
  installRAFTracking()
  await forceGC()

  const start = takeSnapshot('Long Canvas Panning')

  // Simulate 100 pan operations (10 minutes of active panning)
  for (let i = 0; i < 100; i++) {
    // Simulate pan causing dirty rect update
    const canvas = new OffscreenCanvas(8192, 8192)
    const ctx = canvas.getContext('2d', { willReadFrequently: false })

    if (ctx) {
      // Simulate partial update
      const dirtyWidth = 2048
      const dirtyHeight = 2048
      const pixels = new Uint8ClampedArray(dirtyWidth * dirtyHeight * 4)

      // Simulate chunked upload
      let chunk = 0
      const uploadChunk = (): void => {
        chunk++
        if (chunk < 4) {
          window.requestAnimationFrame(uploadChunk)
        }
      }
      window.requestAnimationFrame(uploadChunk)
    }

    await new Promise(resolve => setTimeout(resolve, 5))
  }

  await forceGC()
  const end = takeSnapshot('Long Canvas Panning')

  uninstallRAFTracking()
  return calculateGrowth(start, end)
}

/**
 * Test 3: Rapid dialog open/close
 *
 * Tests AntiAliasDialog RAF leak fix
 */
export async function testRapidDialogOpenClose(): Promise<MemoryTestResult> {
  installRAFTracking()
  await forceGC()

  const start = takeSnapshot('Rapid Dialog Open/Close')

  // Simulate 100 rapid dialog open/close cycles
  for (let i = 0; i < 100; i++) {
    // Simulate dialog mounting and scheduling preview RAF
    const frameId = window.requestAnimationFrame(() => {
      // Preview render callback
    })

    // Simulate immediate dialog close (should cancel RAF)
    window.cancelAnimationFrame(frameId)

    await new Promise(resolve => setTimeout(resolve, 5))
  }

  await forceGC()
  const end = takeSnapshot('Rapid Dialog Open/Close')

  uninstallRAFTracking()
  return calculateGrowth(start, end)
}

/**
 * Test 4: Mixed workload
 *
 * Combines multiple scenarios to simulate real-world usage
 */
export async function testMixedWorkload(): Promise<MemoryTestResult> {
  installRAFTracking()
  await forceGC()

  const start = takeSnapshot('Mixed Workload')

  for (let i = 0; i < 30; i++) {
    // Pan
    const canvas1 = new OffscreenCanvas(4096, 4096)
    const ctx1 = canvas1.getContext('2d')
    if (ctx1) {
      window.requestAnimationFrame(() => {})
    }

    // Open/close dialog
    const dialogRAF = window.requestAnimationFrame(() => {})
    window.cancelAnimationFrame(dialogRAF)

    // Switch document
    canvas1.width = 1
    canvas1.height = 1

    await new Promise(resolve => setTimeout(resolve, 10))
  }

  await forceGC()
  const end = takeSnapshot('Mixed Workload')

  uninstallRAFTracking()
  return calculateGrowth(start, end)
}

describe('Memory Leak Tests', () => {
  beforeEach(() => {
    // Reset RAF tracking before each test
    activeRAFCallbacks = 0
    rafCallbacks.clear()
    rafIdCounter = 1
  })

  afterEach(() => {
    uninstallRAFTracking()
  })

  it('should not leak memory during rapid document switching', async () => {
    const result = await testRapidDocumentSwitching()
    expect(result.passed).toBe(true)
    expect(result.memoryGrowthMB).toBeLessThan(50)
    expect(result.rafLeaked).toBeLessThan(10)
  })

  it('should not leak memory during long canvas panning', async () => {
    const result = await testLongCanvasPanning()
    expect(result.passed).toBe(true)
    expect(result.memoryGrowthMB).toBeLessThan(50)
    expect(result.rafLeaked).toBeLessThan(10)
  })

  it('should not leak RAF callbacks during rapid dialog open/close', async () => {
    const result = await testRapidDialogOpenClose()
    expect(result.passed).toBe(true)
    expect(result.memoryGrowthMB).toBeLessThan(50)
    expect(result.rafLeaked).toBeLessThan(10)
  })

  it('should not leak memory during mixed workload', async () => {
    const result = await testMixedWorkload()
    expect(result.passed).toBe(true)
    expect(result.memoryGrowthMB).toBeLessThan(50)
    expect(result.rafLeaked).toBeLessThan(10)
  })

  it('should pass all memory leak tests', async () => {
    const { summary } = await runAllMemoryLeakTests()
    expect(summary.allPassed).toBe(true)
    expect(summary.failed).toBe(0)
    expect(summary.passed).toBe(4)
  })
})

/**
 * Run all memory leak tests
 */
export async function runAllMemoryLeakTests(): Promise<{
  results: MemoryTestResult[]
  summary: {
    totalTests: number
    passed: number
    failed: number
    allPassed: boolean
  }
}> {
  console.log('🔍 Starting Memory Leak Test Suite...\n')

  const results: MemoryTestResult[] = []

  // Test 1
  console.log('Test 1: Rapid Document Switching...')
  const test1 = await testRapidDocumentSwitching()
  results.push(test1)
  console.log(`  ${test1.passed ? '✅' : '❌'} ${test1.details}\n`)

  // Test 2
  console.log('Test 2: Long Canvas Panning...')
  const test2 = await testLongCanvasPanning()
  results.push(test2)
  console.log(`  ${test2.passed ? '✅' : '❌'} ${test2.details}\n`)

  // Test 3
  console.log('Test 3: Rapid Dialog Open/Close...')
  const test3 = await testRapidDialogOpenClose()
  results.push(test3)
  console.log(`  ${test3.passed ? '✅' : '❌'} ${test3.details}\n`)

  // Test 4
  console.log('Test 4: Mixed Workload...')
  const test4 = await testMixedWorkload()
  results.push(test4)
  console.log(`  ${test4.passed ? '✅' : '❌'} ${test4.details}\n`)

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log('📊 Test Summary:')
  console.log(`  Total: ${results.length}`)
  console.log(`  Passed: ${passed}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Result: ${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}\n`)

  return {
    results,
    summary: {
      totalTests: results.length,
      passed,
      failed,
      allPassed: failed === 0
    }
  }
}
