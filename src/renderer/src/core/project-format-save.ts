import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { type SpriteDocument } from '@shared/types-document'
import { getLayerStorageOrigin, getRasterContentRevision, setLayerStorageOrigin } from './document-model'
import { ensureAnimationDocument } from './animation'
import { translateCurrent as tr } from './localization'
import { rasterStorageIdentity } from './runtime-raster'
import { encodeProjectInWorker } from './project-save-worker-client'
import {
  type ProjectSaveBaseline,
  type ProjectEncodeWorkerResult,
  type ProjectEncodeWorkerPayload,
  type ProjectEncodeOptions,
  type ProjectArchiveReuseEntry,
  type ProjectManifest,
  type ProjectArchiveResource,
  type ManifestLayer,
  type ManifestCel,
  type EncodedProjectSave,
  PROJECT_SCHEMA_VERSION
} from './project-format-manifest-types'
import { createProjectArchiveFiles, createProjectZipEntries, rasterMetadataMatches, tilesetRasterMetadata } from './project-format-encode'
import { rasterDataEncoding } from './project-format-raster'
import { directActiveCelDataFiles, readManifest } from './project-format-manifest'

const projectSaveBaselines = new WeakMap<SpriteDocument, ProjectSaveBaseline>()

export function encodeProjectAsync(document: SpriteDocument, options: ProjectEncodeOptions = {}): Promise<Uint8Array> {
  options.onProgress?.(0)
  options.onProgress?.(0.05)
  return encodeProjectInWorker(createProjectEncodeWorkerPayload(document, options, false), encodeProjectWorkerPayload).then((result) => {
    options.onProgress?.(1)
    return result.data
  })
}

const readZipEntryMetadata = (data: Uint8Array): Map<string, { crc32: number; byteLength: number }> => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = data.byteLength - 22
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1
  if (end < 0) throw new Error(tr('core.project.unzip'))
  const commentLength = view.getUint16(end + 20, true)
  if (end + 22 + commentLength !== data.byteLength) throw new Error(tr('core.project.unzip'))
  const entryCount = view.getUint16(end + 10, true)
  const centralDirectorySize = view.getUint32(end + 12, true)
  let offset = view.getUint32(end + 16, true)
  if (offset > end || centralDirectorySize > end - offset) throw new Error(tr('core.project.unzip'))
  const centralDirectoryEnd = offset + centralDirectorySize
  const decoder = new TextDecoder()
  const entries = new Map<string, { crc32: number; byteLength: number }>()
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > data.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error(tr('core.project.unzip'))
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameEnd = offset + 46 + nameLength
    const nextOffset = nameEnd + extraLength + commentLength
    if (nameEnd > data.byteLength || nextOffset > centralDirectoryEnd) throw new Error(tr('core.project.unzip'))
    const name = decoder.decode(data.subarray(offset + 46, nameEnd))
    if (!name || entries.has(name)) throw new Error(tr('core.project.unzip'))
    const compressedLength = view.getUint32(offset + 20, true)
    const localOffset = view.getUint32(offset + 42, true)
    if (compressedLength === 0xffffffff || localOffset === 0xffffffff || localOffset + 30 > data.byteLength || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(tr('core.project.unzip'))
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (dataStart > data.byteLength || compressedLength > data.byteLength - dataStart) throw new Error(tr('core.project.unzip'))
    entries.set(name, {
      crc32: view.getUint32(offset + 16, true),
      byteLength: view.getUint32(offset + 24, true)
    })
    offset = nextOffset
  }
  if (offset !== centralDirectoryEnd) throw new Error(tr('core.project.unzip'))
  return entries
}

const readZipEntryCrcs = (data: Uint8Array): Map<string, number> => new Map(Array.from(readZipEntryMetadata(data), ([name, metadata]) => [name, metadata.crc32]))

// Local edit counters alone cannot identify pixels: switching frames often
// replaces a layer's storage with another buffer at the same edit revision.
const projectRasterVersions = new WeakMap<object, { revision: number; version: number }>()
let nextProjectRasterVersion = 0
const projectRasterVersion = (storage: object): number => {
  const revision = getRasterContentRevision(storage)
  const previous = projectRasterVersions.get(storage)
  if (previous?.revision === revision) return previous.version
  const version = ++nextProjectRasterVersion
  projectRasterVersions.set(storage, { revision, version })
  return version
}

const captureProjectResourceRevisions = (document: SpriteDocument): Array<[string, number | null]> => {
  const revisions: Array<[string, number | null]> = []
  for (const layer of document.layers) revisions.push([`layer:${layer.id}`, projectRasterVersion(rasterStorageIdentity(layer))])
  for (const tileset of document.tilesets ?? []) revisions.push([`tileset:${tileset.id}`, projectRasterVersion(tileset.pixels)])
  const timeline = ensureAnimationDocument(document)
  for (const cel of timeline.cels) {
    if (cel.surface) revisions.push([`cel:${cel.id}`, projectRasterVersion(rasterStorageIdentity(cel.surface))])
  }
  for (const entry of timeline.layerMasks ?? []) revisions.push([`layer-mask:${entry.layerId}:${entry.frameId}`, projectRasterVersion(entry.mask.pixels)])
  for (const entry of timeline.groupMasks ?? []) revisions.push([`group-mask:${entry.groupId}:${entry.frameId}`, projectRasterVersion(entry.mask.pixels)])
  for (const snapshot of document.timelapse?.snapshots ?? []) revisions.push([`timelapse:${snapshot.id}`, null])
  return revisions
}

const createProjectEncodeWorkerPayload = (document: SpriteDocument, options: ProjectEncodeOptions, incremental: boolean): ProjectEncodeWorkerPayload => {
  const baseline = incremental ? projectSaveBaselines.get(document) : undefined
  return {
    document,
    includePreview: options.includePreview !== false,
    compressionLevel: options.compressionLevel ?? 6,
    incremental,
    baseline: baseline
      ? {
          sourcePath: baseline.sourcePath,
          schemaVersion: baseline.schemaVersion,
          preview: baseline.preview,
          resources: [...baseline.resources.entries()]
        }
      : undefined,
    resourceRevisions: captureProjectResourceRevisions(document),
    layerStorageOrigins: document.layers.map((layer) => [layer.id, getLayerStorageOrigin(layer)])
  }
}

export function encodeProjectWorkerPayload(payload: ProjectEncodeWorkerPayload): ProjectEncodeWorkerResult {
  for (const [layerId, origin] of payload.layerStorageOrigins) {
    const layer = payload.document.layers.find((candidate) => candidate.id === layerId)
    if (layer) setLayerStorageOrigin(layer, origin)
  }
  const baseline: ProjectSaveBaseline | undefined = payload.baseline
    ? {
        sourcePath: payload.baseline.sourcePath,
        schemaVersion: payload.baseline.schemaVersion,
        preview: payload.baseline.preview,
        resources: new Map(payload.baseline.resources)
      }
    : undefined
  const { files, resources, preview } = createProjectArchiveFiles(
    payload.document,
    {
      includePreview: payload.includePreview,
      compressionLevel: payload.compressionLevel
    },
    baseline,
    new Map(payload.resourceRevisions)
  )
  if (!payload.incremental) {
    return {
      data: zipSync(createProjectZipEntries(files), {
        level: payload.compressionLevel
      }),
      sourcePath: null,
      reusableEntries: [],
      baseline: { resources: [] }
    }
  }
  const reusableEntries: ProjectArchiveReuseEntry[] = []
  const reusableCrcs = new Map<string, number>()
  const patchFiles = { ...files }
  if (baseline)
    for (const resource of resources) {
      const previous = baseline.resources.get(resource.key)
      const byteLength = previous?.byteLength ?? previous?.raster?.byteLength
      if (!previous || byteLength === undefined || previous.path !== resource.path || previous.revision !== resource.revision || !rasterMetadataMatches(previous.raster, resource.raster)) continue
      delete patchFiles[resource.path]
      if (!reusableCrcs.has(resource.path))
        reusableEntries.push({
          path: resource.path,
          crc32: previous.crc32,
          byteLength,
          ...(resource.raster
            ? {
                encoding: resource.raster.dataEncoding,
                width: resource.raster.width,
                height: resource.raster.height
              }
            : {})
        })
      reusableCrcs.set(resource.path, previous.crc32)
    }
  if (baseline && reusableEntries.length > 0) patchFiles['.moonsprite-save-plan.json'] = strToU8(JSON.stringify({ version: 2, entries: reusableEntries }))
  const data = zipSync(createProjectZipEntries(patchFiles), {
    level: payload.compressionLevel
  })
  const patchCrcs = readZipEntryCrcs(data)
  const baselineResources = resources.flatMap((resource) => {
    const crc32 = reusableCrcs.get(resource.path) ?? patchCrcs.get(resource.path)
    return crc32 === undefined ? [] : [{ ...resource, crc32 }]
  })
  return {
    data,
    sourcePath: baseline?.sourcePath ?? null,
    reusableEntries,
    baseline: { resources: baselineResources, preview }
  }
}

const projectResourcesFromManifest = (document: SpriteDocument, manifest: ProjectManifest, entryMetadata?: ReadonlyMap<string, { crc32: number; byteLength: number }>): ProjectArchiveResource[] => {
  const candidates = new Map<string, ProjectArchiveResource>()
  const add = (key: string, path: string | null | undefined, revision: number | null, raster?: ProjectArchiveResource['raster']): void => {
    if (!path) return
    const byteLength = entryMetadata?.get(path)?.byteLength
    candidates.set(key, {
      key,
      path,
      revision,
      ...(byteLength === undefined ? {} : { byteLength }),
      ...(raster
        ? {
            raster: byteLength === undefined ? raster : { ...raster, byteLength }
          }
        : {})
    })
  }
  const rasterFromMetadata = (
    metadata: Pick<ManifestLayer | ManifestCel, 'width' | 'height' | 'offsetX' | 'offsetY' | 'dataEncoding'> | undefined,
    fallbackWidth?: number,
    fallbackHeight?: number
  ): ProjectArchiveResource['raster'] | undefined => {
    const width = Number.isSafeInteger(metadata?.width) && metadata!.width! > 0 ? metadata!.width! : fallbackWidth
    const height = Number.isSafeInteger(metadata?.height) && metadata!.height! > 0 ? metadata!.height! : fallbackHeight
    const dataEncoding = rasterDataEncoding(metadata?.dataEncoding)
    if (!width || !height || !dataEncoding) return undefined
    return {
      width,
      height,
      offsetX: Number.isFinite(metadata?.offsetX) ? Math.trunc(metadata!.offsetX!) : 0,
      offsetY: Number.isFinite(metadata?.offsetY) ? Math.trunc(metadata!.offsetY!) : 0,
      dataEncoding
    }
  }
  const layerMetadata = new Map(manifest.document.layers.map((layer) => [layer.id, layer]))
  const activeCelFiles = directActiveCelDataFiles(manifest)
  for (const layer of document.layers) {
    const metadata = layerMetadata.get(layer.id)
    const activeCel = activeCelFiles.get(layer.id)
    const storage = rasterStorageIdentity(layer)
    add(`layer:${layer.id}`, activeCel?.dataFile ?? metadata?.dataFile, projectRasterVersion(storage), activeCel ?? rasterFromMetadata(metadata, manifest.document.width, manifest.document.height))
  }
  const tilesetMetadata = new Map((manifest.document.tilesets ?? []).map((tileset) => [tileset.id, tileset]))
  for (const tileset of document.tilesets ?? []) {
    const dataFile = tilesetMetadata.get(tileset.id)?.dataFile
    const raster = tilesetRasterMetadata(tileset)
    add(`tileset:${tileset.id}`, dataFile, projectRasterVersion(tileset.pixels), {
      ...raster,
      ...(dataFile && entryMetadata?.get(dataFile) ? { byteLength: entryMetadata.get(dataFile)!.byteLength } : {})
    })
  }
  const timeline = ensureAnimationDocument(document)
  const celMetadata = new Map(manifest.document.animation.cels.map((cel) => [cel.id, cel]))
  for (const cel of timeline.cels) {
    const metadata = celMetadata.get(cel.id)
    if (cel.surface && metadata?.dataFile) {
      const storage = rasterStorageIdentity(cel.surface)
      add(`cel:${cel.id}`, metadata.dataFile, projectRasterVersion(storage), rasterFromMetadata(metadata))
    }
  }
  const layerMaskMetadata = new Map((manifest.document.animation.layerMasks ?? []).map((entry) => [`${entry.layerId}\u0000${entry.frameId}`, entry]))
  for (const entry of timeline.layerMasks ?? []) add(`layer-mask:${entry.layerId}:${entry.frameId}`, layerMaskMetadata.get(`${entry.layerId}\u0000${entry.frameId}`)?.mask.dataFile, projectRasterVersion(entry.mask.pixels))
  const groupMaskMetadata = new Map((manifest.document.animation.groupMasks ?? []).map((entry) => [`${entry.groupId}\u0000${entry.frameId}`, entry]))
  for (const entry of timeline.groupMasks ?? []) add(`group-mask:${entry.groupId}:${entry.frameId}`, groupMaskMetadata.get(`${entry.groupId}\u0000${entry.frameId}`)?.mask.dataFile, projectRasterVersion(entry.mask.pixels))
  const snapshotMetadata = new Map((manifest.document.timelapse?.snapshots ?? []).map((snapshot) => [snapshot.id, snapshot]))
  for (const snapshot of document.timelapse?.snapshots ?? []) add(`timelapse:${snapshot.id}`, snapshotMetadata.get(snapshot.id)?.dataFile, null)
  return Array.from(candidates.values())
}

const manifestResourcePaths = (manifest: ProjectManifest): string[] => {
  const paths: string[] = []
  const add = (path: string | undefined): void => {
    if (path) paths.push(path)
  }
  for (const layer of manifest.document.layers) add(layer.dataFile)
  for (const brush of manifest.document.customBrushes ?? []) {
    add(brush.dataFile)
    add(brush.colorsFile)
  }
  for (const tileset of manifest.document.tilesets ?? []) add(tileset.dataFile)
  for (const cel of manifest.document.animation.cels) add(cel.dataFile)
  for (const entry of manifest.document.animation.layerMasks ?? []) add(entry.mask.dataFile)
  for (const entry of manifest.document.animation.groupMasks ?? []) add(entry.mask.dataFile)
  for (const snapshot of manifest.document.timelapse?.snapshots ?? []) add(snapshot.dataFile)
  return paths
}

export function registerProjectSaveBaseline(document: SpriteDocument, sourcePath: string, archive: Uint8Array): boolean {
  let entryMetadata: Map<string, { crc32: number; byteLength: number }>
  let manifest: ProjectManifest
  let sourceSchemaVersion: number
  try {
    entryMetadata = readZipEntryMetadata(archive)
    const manifestFiles = unzipSync(archive, {
      filter: (file) => file.name === 'manifest.json'
    })
    const rawManifest = JSON.parse(strFromU8(manifestFiles['manifest.json'])) as { schemaVersion?: unknown }
    sourceSchemaVersion = Number(rawManifest.schemaVersion)
    manifest = readManifest(manifestFiles)
    if (manifestResourcePaths(manifest).some((path) => !entryMetadata.has(path))) throw new Error('Missing project resource')
  } catch {
    projectSaveBaselines.delete(document)
    return false
  }
  const resources = new Map<
    string,
    {
      path: string
      crc32: number
      revision: number | null
      byteLength?: number
      raster?: ProjectArchiveResource['raster']
    }
  >()
  for (const resource of projectResourcesFromManifest(document, manifest, entryMetadata)) {
    const metadata = entryMetadata.get(resource.path)
    if (metadata !== undefined)
      resources.set(resource.key, {
        path: resource.path,
        crc32: metadata.crc32,
        revision: resource.revision,
        byteLength: metadata.byteLength,
        ...(resource.raster ? { raster: resource.raster } : {})
      })
  }
  projectSaveBaselines.set(document, {
    sourcePath,
    schemaVersion: sourceSchemaVersion,
    resources
  })
  return true
}

export async function encodeProjectSaveAsync(document: SpriteDocument, options: ProjectEncodeOptions = {}): Promise<EncodedProjectSave> {
  options.onProgress?.(0)
  options.onProgress?.(0.05)
  const result = await encodeProjectInWorker(createProjectEncodeWorkerPayload(document, options, true), encodeProjectWorkerPayload)
  options.onProgress?.(1)
  return result
}

export function acceptProjectSaveBaseline(document: SpriteDocument, filePath: string, encoded: EncodedProjectSave): void {
  const resources = new Map<
    string,
    {
      path: string
      crc32: number
      revision: number | null
      byteLength?: number
      raster?: ProjectArchiveResource['raster']
    }
  >()
  for (const resource of encoded.baseline.resources)
    resources.set(resource.key, {
      path: resource.path,
      crc32: resource.crc32,
      revision: resource.revision,
      ...(resource.byteLength === undefined ? {} : { byteLength: resource.byteLength }),
      ...(resource.raster ? { raster: resource.raster } : {})
    })
  projectSaveBaselines.set(document, {
    sourcePath: filePath,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    preview: encoded.baseline.preview,
    resources
  })
}

export function clearProjectSaveBaseline(document: SpriteDocument): void {
  projectSaveBaselines.delete(document)
}
