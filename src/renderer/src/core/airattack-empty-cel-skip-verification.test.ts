/**
 * Verification test for empty cel skipping optimization in opacityGroupCompositeStack
 *
 * Problem: AirAttackFX_0.moonsprite has 42 layers × 297 frames = 12,474 cel slots
 * All cels are 100% transparent, but the system was still performing full composite
 * calculations, causing severe lag and unresponsiveness.
 *
 * Root cause: normalCompositeLayers had empty cel skipping, but opacityGroupCompositeStack
 * did not. Documents with opacity groups or blend modes would take the opacityGroupCompositeStack
 * path and composite every empty cel.
 *
 * Fix: Added animationCelHasContent check in opacityGroupCompositeStack's prepare function,
 * matching the logic in normalCompositeLayers.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { decodeProject } from './project-format-decode'
import { compositeRegion } from './document-composite-region'
import { opacityGroupCompositeStack } from './document-composite-plan'
import { animationCelAt, resolveAnimationCel, animationCelHasContent } from './animation'
import type { CompositeStackItem } from './document-composite-plan'

describe('Empty cel skipping in opacityGroupCompositeStack', () => {
  it('should skip empty cels in AirAttackFX_0.moonsprite', { timeout: 30000 }, () => {
    const document = decodeProject(new Uint8Array(readFileSync('C:/Users/23105/DeskBox/其他/AirAttackFX_0.moonsprite')))
    const timeline = document.animation!

    // Verify all cels are empty
    let emptyCelCount = 0
    let totalCelSlots = 0
    for (const layer of document.layers) {
      for (const frame of timeline.frames) {
        totalCelSlots++
        const cel = animationCelAt(timeline, layer.id, frame.id)
        const resolved = resolveAnimationCel(timeline, cel)
        if (!animationCelHasContent(resolved, document.palette || [])) {
          emptyCelCount++
        }
      }
    }

    console.log(`Total cel slots: ${totalCelSlots}`)
    console.log(`Empty cels: ${emptyCelCount}`)
    console.log(`Layers: ${document.layers.length}, Frames: ${timeline.frames.length}`)

    // The document should have mostly empty cels
    expect(emptyCelCount).toBeGreaterThan(totalCelSlots * 0.9)

    // Test that opacityGroupCompositeStack properly filters empty cels
    const stack = opacityGroupCompositeStack(document)

    const countLayers = (items: readonly CompositeStackItem[] | null): number => {
      if (!items) return 0
      let count = 0
      for (const item of items) {
        if (item.kind === 'layer') count++
        else if (item.kind === 'group') count += countLayers(item.children)
      }
      return count
    }

    const includedLayers = stack ? countLayers(stack) : 0
    console.log(`Layers included in composite stack: ${includedLayers}`)
    console.log(`Total layers in document: ${document.layers.length}`)

    // With empty cel skipping, included layers should be significantly less than total layers
    // Most frames have all empty cels - the optimization dramatically reduces composite work
    expect(includedLayers).toBeLessThanOrEqual(Math.ceil(document.layers.length * 0.1))
  })

  it('should perform fast composite for empty frame', { timeout: 30000 }, () => {
    const document = decodeProject(new Uint8Array(readFileSync('C:/Users/23105/DeskBox/其他/AirAttackFX_0.moonsprite')))

    const startTime = performance.now()
    const output = compositeRegion(document, 0, 0, document.width, document.height)
    const elapsed = performance.now() - startTime

    console.log(`Composite time for ${document.width}×${document.height} with ${document.layers.length} layers: ${elapsed.toFixed(2)}ms`)

    // With empty cel skipping, composite should be very fast
    // Before fix: would process all 42 layers × full composite pipeline
    // After fix: only processes layers with actual content (typically 0-2 layers)
    expect(elapsed).toBeLessThan(100)
  })
})
