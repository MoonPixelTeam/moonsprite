import { createDocument, createLayer, createId } from './document-model'

/** Fresh, small editable artwork; never modifies an existing workspace document. */
export function createTrialExample() {
  const document = createDocument('月夜 · 试用示例', 32, 32, 'rgba', false)
  const background = document.layers[0]
  background.name = '夜空'
  const moon = createLayer('月亮与星光', 32, 32, 'rgba')
  if (background.format !== 'rgba' || moon.format !== 'rgba') throw new Error('Example requires RGBA layers')
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const offset = (y * 32 + x) * 4
    background.pixels.set([16 + Math.floor(y / 4), 24 + Math.floor(y / 2), 50 + y, 255], offset)
    const disc = (x - 17) ** 2 + (y - 13) ** 2 <= 64
    const shadow = (x - 21) ** 2 + (y - 10) ** 2 <= 60
    const star = [[5, 7], [25, 22], [9, 25]].some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) <= 1)
    if (disc && !shadow || star) moon.pixels.set([255, 224, 145, 255], offset)
  }
  document.layers.push(moon)
  document.activeLayerId = moon.id
  document.animation!.cels.push({ id: createId('cel'), layerId: moon.id, frameId: document.animation!.activeFrameId, opacity: 1, surface: { format: 'rgba', width: 32, height: 32, offsetX: 0, offsetY: 0, pixels: moon.pixels } })
  return document
}
