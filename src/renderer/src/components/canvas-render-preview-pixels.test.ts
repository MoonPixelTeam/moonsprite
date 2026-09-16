import { describe, expect, it } from 'vitest'
import { canvasPreviewDisplayColor } from './canvas-render-preview-pixels'

describe('canvas preview pixel composition', () => {
  it('keeps onion skin visible beneath a transparent eraser preview', () => {
    const onionColor = { r: 255, g: 64, b: 64, a: 128 }

    expect(canvasPreviewDisplayColor({ r: 0, g: 0, b: 0, a: 0 }, false, onionColor)).toEqual(onionColor)
  })

  it('leaves an opaque pencil preview unchanged', () => {
    const paintColor = { r: 24, g: 96, b: 208, a: 255 }

    expect(canvasPreviewDisplayColor(paintColor, false, { r: 255, g: 64, b: 64, a: 128 })).toEqual(paintColor)
  })
})
