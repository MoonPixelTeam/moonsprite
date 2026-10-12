import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { animationCelAt, animationFrameAt, createAnimationCelLookup, ensureAnimationDocument, resolveAnimationCel } from './animation'
import { createDocument, createLayer } from './document-model'

describe('large animation timeline indexes', () => {
  it('reuses frame and cel slot indexes across many layer/frame lookups', () => {
    const document = createDocument('4096 animation index', 4096, 4096, 'rgba', false)
    for (let index = 1; index < 100; index += 1) document.layers.push(createLayer(`Layer ${index}`, 4096, 4096, 'rgba'))
    const timeline = ensureAnimationDocument(document)
    for (let index = 1; index < 8; index += 1) timeline.frames.push({ id: `frame-${index + 1}`, duration: 100 })
    timeline.cels = document.layers.flatMap((layer) => timeline.frames.map((frame, frameIndex) => ({
      id: `${layer.id}:${frame.id}`,
      layerId: layer.id,
      frameId: frame.id,
      linkedCelId: frameIndex > 0 ? `${layer.id}:${timeline.frames[0].id}` : null
    })))
    const calls = 100 * 8 * 64
    const started = performance.now()
    let baselineHits = 0
    for (let index = 0; index < calls; index += 1) {
      const layer = document.layers[index % document.layers.length]
      const frame = timeline.frames[(index * 7) % timeline.frames.length]
      baselineHits += Number(timeline.cels.find((cel) => cel.layerId === layer.id && cel.frameId === frame.id) !== undefined)
      baselineHits += Number(timeline.frames.find((candidate) => candidate.id === frame.id) !== undefined)
    }
    const baselineMs = performance.now() - started
    const optimizedStarted = performance.now()
    let optimizedHits = 0
    for (let index = 0; index < calls; index += 1) {
      const layer = document.layers[index % document.layers.length]
      const frame = timeline.frames[(index * 7) % timeline.frames.length]
      optimizedHits += Number(animationCelAt(timeline, layer.id, frame.id) !== null)
      optimizedHits += Number(animationFrameAt(timeline, frame.id) !== null)
    }
    const optimizedMs = performance.now() - optimizedStarted
    const nextFrame = { id: 'frame-9', duration: 100 }
    timeline.frames.push(nextFrame)
    expect(animationFrameAt(timeline, nextFrame.id)).toBe(nextFrame)
    const nextCel = { id: 'new-cel', layerId: document.layers[0].id, frameId: nextFrame.id }
    timeline.cels.push(nextCel)
    expect(animationCelAt(timeline, nextCel.layerId, nextCel.frameId)).toBe(nextCel)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, content: 'linked animation cels' },
      calls,
      baselineLinearScans: calls * 2,
      cachedMapBuilds: 1,
      baselineHits,
      optimizedHits,
      baselineMs,
      optimizedMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/animation-timeline-index-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(optimizedHits).toBe(baselineHits)
    expect(optimizedMs).toBeLessThan(baselineMs)
  })

  it('reuses linked cel ID maps across playback resolution calls', () => {
    const document = createDocument('4096 linked cel resolver', 4096, 4096, 'rgba', false)
    for (let index = 1; index < 100; index += 1) document.layers.push(createLayer(`Layer ${index}`, 4096, 4096, 'rgba'))
    const timeline = ensureAnimationDocument(document)
    for (let index = 1; index < 8; index += 1) timeline.frames.push({ id: `frame-${index + 1}`, duration: 100 })
    timeline.cels = document.layers.flatMap((layer) => timeline.frames.map((frame, frameIndex) => ({
      id: `${layer.id}:${frame.id}`,
      layerId: layer.id,
      frameId: frame.id,
      linkedCelId: frameIndex > 0 ? `${layer.id}:${timeline.frames[0].id}` : null
    })))
    const inputs = timeline.cels.filter((cel) => cel.linkedCelId)
    const calls = inputs.length * 64
    const baselineStarted = performance.now()
    let baselineHits = 0
    for (let index = 0; index < calls; index += 1) baselineHits += Number(createAnimationCelLookup(timeline).resolve(inputs[index % inputs.length]) !== null)
    const baselineMs = performance.now() - baselineStarted
    const optimizedStarted = performance.now()
    let optimizedHits = 0
    for (let index = 0; index < calls; index += 1) optimizedHits += Number(resolveAnimationCel(timeline, inputs[index % inputs.length]) !== null)
    const optimizedMs = performance.now() - optimizedStarted
    const root = inputs[0]
    root.linkedCelId = null
    expect(resolveAnimationCel(timeline, root)).toBe(root)
    root.linkedCelId = `${root.layerId}:${timeline.frames[0].id}`
    timeline.cels.push({ id: 'new-linked-cel', layerId: root.layerId, frameId: 'new-frame', linkedCelId: root.id })
    expect(resolveAnimationCel(timeline, timeline.cels.at(-1)!)?.id).toBe(`${root.layerId}:${timeline.frames[0].id}`)
    const evidence = {
      scenario: { canvas: '4096x4096', layers: 100, frames: 8, cels: 800, content: 'linked playback cels' },
      calls,
      baselineLookupBuilds: calls,
      cachedLookupBuilds: 1,
      baselineHits,
      optimizedHits,
      baselineMs,
      optimizedMs,
      elapsedReductionRatio: baselineMs > 0 ? 1 - optimizedMs / baselineMs : 0
    }
    mkdirSync(resolve('output'), { recursive: true })
    writeFileSync(resolve('output/animation-linked-cel-resolver-after-20261006.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    expect(optimizedHits).toBe(baselineHits)
    expect(optimizedMs).toBeLessThan(baselineMs)
  }, 30000)
})
