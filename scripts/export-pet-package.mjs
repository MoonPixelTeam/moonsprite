import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import UPNG from 'upng-js'

const [sourcePath, outputPath, petName = '宠物', extensionId = 'moonsprite.pet'] = process.argv.slice(2)
if (!sourcePath || !outputPath) throw new Error('用法：node scripts/export-pet-package.mjs <源.moonsprite> <输出.msext> [名称] [扩展ID]')

const archive = unzipSync(readFileSync(resolve(sourcePath)))
const document = JSON.parse(strFromU8(archive['manifest.json'])).document
const timeline = document.animation
if (!timeline?.frames?.length) throw new Error('源工程没有动画时间轴。')

const frames = timeline.frames
const frameIndex = new Map(frames.map((frame, index) => [frame.id, index]))
const rangeFor = (name) => {
  const section = (timeline.loopSections ?? []).find((item) => item.name.toUpperCase() === name)
  const start = section && frameIndex.get(section.startFrameId)
  const end = section && frameIndex.get(section.endFrameId)
  if (start === undefined || end === undefined || end < start) throw new Error(`找不到有效的 ${name} 循环节。`)
  return frames.slice(start, end + 1)
}

// A document background is an editor surface, not part of the transparent pet.
const visibleLayers = new Map(document.layers.filter((layer) => layer.visible && !layer.background).map((layer) => [layer.id, layer]))
const celsById = new Map((timeline.cels ?? []).map((cell) => [cell.id, cell]))
const resolvedCell = (cell) => {
  let source = cell
  const visited = new Set([cell.id])
  while (source.linkedCelId) {
    if (visited.has(source.linkedCelId)) throw new Error(`动画帧链接循环：${cell.id}`)
    visited.add(source.linkedCelId)
    source = celsById.get(source.linkedCelId)
    if (!source) throw new Error(`缺少已链接的动画帧：${cell.linkedCelId}`)
  }
  return { ...source, frameId: cell.frameId, layerId: cell.layerId, opacity: cell.opacity ?? source.opacity }
}
const cellsByFrame = new Map()
for (const cell of timeline.cels ?? []) {
  if (!visibleLayers.has(cell.layerId)) continue
  const cells = cellsByFrame.get(cell.frameId) ?? []
  cells.push(resolvedCell(cell))
  cellsByFrame.set(cell.frameId, cells)
}

const pixelsFor = (cell) => {
  const stored = archive[cell.dataFile]
  if (!stored) throw new Error(`缺少动画帧资源：${cell.dataFile}`)
  if (cell.dataEncoding !== 'sparse-tiles-v1') return stored
  const output = new Uint8Array(cell.width * cell.height * 4)
  const view = new DataView(stored.buffer, stored.byteOffset, stored.byteLength)
  const count = view.getUint32(16, true)
  for (let index = 0; index < count; index++) {
    const entry = 24 + index * 16
    const x = view.getUint32(entry, true)
    const y = view.getUint32(entry + 4, true)
    const width = view.getUint16(entry + 8, true)
    const height = view.getUint16(entry + 10, true)
    const offset = view.getUint32(entry + 12, true)
    for (let row = 0; row < height; row++) output.set(stored.subarray(offset + row * width * 4, offset + (row + 1) * width * 4), ((y + row) * cell.width + x) * 4)
  }
  return output
}

const blend = (target, offset, source, sourceOffset, opacity = 1) => {
  const alpha = source[sourceOffset + 3] / 255 * opacity
  if (!alpha) return
  const destinationAlpha = target[offset + 3] / 255
  const outputAlpha = alpha + destinationAlpha * (1 - alpha)
  for (let channel = 0; channel < 3; channel++) target[offset + channel] = Math.round((source[sourceOffset + channel] * alpha + target[offset + channel] * destinationAlpha * (1 - alpha)) / outputAlpha)
  target[offset + 3] = Math.round(outputAlpha * 255)
}

const render = (frame) => {
  const output = new Uint8Array(document.width * document.height * 4)
  for (const cell of cellsByFrame.get(frame.id) ?? []) {
    const pixels = pixelsFor(cell)
    for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) {
      const targetX = cell.offsetX + x
      const targetY = cell.offsetY + y
      if (targetX < 0 || targetY < 0 || targetX >= document.width || targetY >= document.height) continue
      blend(output, (targetY * document.width + targetX) * 4, pixels, (y * cell.width + x) * 4, cell.opacity ?? 1)
    }
  }
  return output
}

const showFrames = rangeFor('SHOW')
const idleFrames = rangeFor('IDLE')
const allFrames = [...showFrames, ...idleFrames]
const renderedFrames = allFrames.map(render)
const cropBounds = (frames) => {
  let left = document.width
  let top = document.height
  let right = -1
  let bottom = -1
  for (const pixels of frames) for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
    if (pixels[(y * document.width + x) * 4 + 3] < 16) continue
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) throw new Error('宠物动画没有可见像素。')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}
const bounds = cropBounds(renderedFrames)
const frameWidth = bounds.width
const frameHeight = bounds.height
const sheet = new Uint8Array(frameWidth * frameHeight * allFrames.length * 4)
for (let index = 0; index < renderedFrames.length; index++) for (let row = 0; row < frameHeight; row++) {
  const sourceOffset = ((bounds.top + row) * document.width + bounds.left) * 4
  const targetOffset = (index * frameWidth * frameHeight + row * frameWidth) * 4
  sheet.set(renderedFrames[index].subarray(sourceOffset, sourceOffset + frameWidth * 4), targetOffset)
}

const manifest = {
  schemaVersion: 1,
  id: extensionId,
  name: `${petName} 宠物`,
  version: '1.0.0',
  description: `由 ${basename(sourcePath)} 导出的宿主渲染宠物。`,
  pets: [{
    id: 'companion',
    name: petName,
    description: 'MoonSprite 工程陪伴宠物',
    spriteSheet: 'assets/companion.png',
    frameWidth,
    frameHeight,
    animations: [
      { state: 'show', frames: showFrames.map((_, index) => index), fps: 10 },
      { state: 'idle', frames: idleFrames.map((_, index) => showFrames.length + index), fps: 8 }
    ]
  }]
}
const sprite = new Uint8Array(UPNG.encode([sheet.buffer], frameWidth, frameHeight * allFrames.length, 0))
writeFileSync(resolve(outputPath), zipSync({ 'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)), 'assets/companion.png': sprite }, { level: 9 }))
console.log(`已生成 ${outputPath}：${frameWidth}x${frameHeight}，已裁剪源画布 (${bounds.left}, ${bounds.top})，SHOW ${showFrames.length} 帧，IDLE ${idleFrames.length} 帧。`)
