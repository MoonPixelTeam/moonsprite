import type { ProjectManifest, RasterDataSource } from './project-format-manifest-types'

export const requiredProjectDataFiles = (manifest: ProjectManifest, activeCelFiles: ReadonlyMap<string, RasterDataSource>, storedTimelapseFiles: ReadonlyMap<string, Uint8Array> = new Map()): Set<string> => {
  const source = manifest.document
  const required = new Set<string>()
  for (const layer of source.layers) required.add(activeCelFiles.get(layer.id)?.dataFile ?? layer.dataFile)
  for (const brush of source.customBrushes ?? []) {
    required.add(brush.dataFile)
    if (brush.colorsFile) required.add(brush.colorsFile)
  }
  for (const tileset of source.tilesets ?? []) required.add(tileset.dataFile)
  for (const image of source.referenceImages ?? []) required.add(image.dataFile)
  for (const image of source.canvasReferences ?? []) required.add(image.dataFile)
  for (const cel of source.animation.cels) {
    if (cel.dataFile) required.add(cel.dataFile)
    if (cel.mask?.dataFile) required.add(cel.mask.dataFile)
  }
  for (const entry of source.animation.layerMasks ?? []) required.add(entry.mask.dataFile)
  for (const entry of source.animation.groupMasks ?? []) required.add(entry.mask.dataFile)
  for (const snapshot of source.timelapse?.snapshots ?? []) if (snapshot.dataFile && !storedTimelapseFiles.has(snapshot.dataFile)) required.add(snapshot.dataFile)
  return required
}
