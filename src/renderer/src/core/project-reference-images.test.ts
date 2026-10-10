import { expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createDocument } from './document-model'
import { decodeProject, encodeProject, encodeProjectAsync, encodeProjectSaveAsync, registerProjectSaveBaseline, PROJECT_SCHEMA_VERSION } from './project-format'
import { readProjectExpandedRasterBytes } from './project-format-metadata'

const referenceSource = 'data:image/png;base64,iVBORw0KGgo='
const canvasImage = { id: 'canvas-ref', src: referenceSource, name: 'pin.png', x: -50, y: 27, width: 30, height: 20, angle: 45, flipX: true, flipY: false, opacity: 0.5, locked: true, floating: true,
  initial: { x: -50, y: 27, width: 30, height: 20, angle: 0, flipX: false, flipY: false } }

function fixture() {
  const project = createDocument('Pinned references', 1, 1, 'rgba')
  project.referenceImages = [
    { id: 'ref-1', width: 2, height: 1, pixels: new Uint8ClampedArray([255, 0, 0, 128, 0, 255, 0, 255]) },
    { id: 'ref-2', width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 255, 0]) }
  ]
  return project
}

it.each(['rgba', 'indexed', 'grayscale'] as const)('preserves RGBA reference pixels independently from %s artwork', mode => {
  const project = fixture()
  project.colorMode = mode
  if (mode === 'indexed') project.layers[0] = createDocument('Indexed', 1, 1, mode).layers[0]
  const archive = encodeProject(project, { includePreview: false })
  const files = unzipSync(archive)
  expect(files['references/ref-1.rgba']).toEqual(new Uint8Array(project.referenceImages![0].pixels))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  expect(manifest.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
  expect(manifest.document.referenceImages[0]).toEqual({ id: 'ref-1', width: 2, height: 1, dataFile: 'references/ref-1.rgba' })
  expect(decodeProject(archive).referenceImages).toEqual(project.referenceImages)
  expect(readProjectExpandedRasterBytes(archive)).toBeGreaterThanOrEqual(12)
})

it('includes references in worker saves and recovery snapshots without a preview', async () => {
  const project = fixture()
  const archive = await encodeProjectAsync(project, { includePreview: false, compressionLevel: 1 })
  expect(unzipSync(archive)['preview.png']).toBeUndefined()
  expect(decodeProject(archive).referenceImages).toEqual(project.referenceImages)
  expect(project.referenceImages![0].pixels.byteLength).toBe(8)
})

it.each([19, 20])('migrates v%s projects to an empty reference library', version => {
  const project = fixture()
  project.canvasReferences = [canvasImage]
  const files = unzipSync(encodeProject(project, { includePreview: false }))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  manifest.schemaVersion = manifest.document.schemaVersion = version
  // Unknown fields in older formats must not acquire new meaning.
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  const reopened = decodeProject(zipSync(files))
  expect(reopened.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
  expect(reopened.referenceImages).toEqual([])
  expect(reopened.canvasReferences).toEqual([])
})

it('round trips embedded canvas references, replaces their source in incremental saves and excludes runtime document IDs', async () => {
  const project = fixture()
  project.canvasReferences = [canvasImage]
  const archive = encodeProject(project, { includePreview: false })
  expect(decodeProject(archive).canvasReferences).toEqual([canvasImage])
  const original = unzipSync(archive)
  const manifest = JSON.parse(strFromU8(original['manifest.json']))
  expect(manifest.document.canvasReferences[0]).not.toHaveProperty('src')
  expect(manifest.document.canvasReferences[0]).not.toHaveProperty('documentId')
  expect(registerProjectSaveBaseline(project, 'canvas.moonsprite', archive)).toBe(true)
  const changed = { ...canvasImage, src: 'data:image/png;base64,AAAA', floating: false, locked: false }
  project.canvasReferences = [changed]
  const save = await encodeProjectSaveAsync(project, { includePreview: false })
  const files = unzipSync(save.data)
  for (const entry of save.reusableEntries) files[entry.path] = original[entry.path]
  delete files['.moonsprite-save-plan.json']
  expect(decodeProject(zipSync(files)).canvasReferences).toEqual([changed])
})

it.each(['missing', 'position', 'path', 'source', 'duplicate', 'initial'])('rejects invalid pinned references (%s)', corruption => {
  const project = fixture()
  project.canvasReferences = [canvasImage]
  const files = unzipSync(encodeProject(project, { includePreview: false }))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  const image = manifest.document.canvasReferences[0]
  if (corruption === 'missing') delete files[image.dataFile]
  if (corruption === 'position') image.width = -1
  if (corruption === 'path') image.dataFile = '../source'
  if (corruption === 'source') files[image.dataFile] = strToU8('https://example.com/external.png')
  if (corruption === 'duplicate') manifest.document.canvasReferences.push(image)
  if (corruption === 'initial') image.initial.height = 0
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  expect(() => decodeProject(zipSync(files))).toThrow()
})

it.each(['missing', 'length', 'size', 'duplicate', 'path', 'shape'])('rejects %s reference data instead of silently losing it', corruption => {
  const files = unzipSync(encodeProject(fixture(), { includePreview: false }))
  const manifest = JSON.parse(strFromU8(files['manifest.json']))
  const images = manifest.document.referenceImages
  if (corruption === 'missing') delete files['references/ref-1.rgba']
  if (corruption === 'length') files['references/ref-1.rgba'] = new Uint8Array(4)
  if (corruption === 'size') images[0].width = 0
  if (corruption === 'duplicate') images.push(images[0])
  if (corruption === 'path') images[0].dataFile = 'layers/other.rgba'
  if (corruption === 'shape') manifest.document.referenceImages = {}
  files['manifest.json'] = strToU8(JSON.stringify(manifest))
  expect(() => decodeProject(zipSync(files))).toThrow()
})

it('keeps references in incremental saves and excludes deleted images from the next manifest', async () => {
  const project = fixture()
  const archive = encodeProject(project, { includePreview: false })
  expect(registerProjectSaveBaseline(project, 'pinned.moonsprite', archive)).toBe(true)
  const saved = await encodeProjectSaveAsync(project, { includePreview: false })
  const original = unzipSync(archive)
  const patch = unzipSync(saved.data)
  for (const entry of saved.reusableEntries) patch[entry.path] = original[entry.path]
  delete patch['.moonsprite-save-plan.json']
  expect(decodeProject(zipSync(patch)).referenceImages).toEqual(project.referenceImages)
  project.referenceImages = project.referenceImages!.slice(1)
  const next = await encodeProjectSaveAsync(project, { includePreview: false })
  const manifest = JSON.parse(strFromU8(unzipSync(next.data)['manifest.json']))
  expect(manifest.document.referenceImages.map((image: { id: string }) => image.id)).toEqual(['ref-2'])
  expect(next.reusableEntries.some(entry => entry.path === 'references/ref-1.rgba')).toBe(false)
})
