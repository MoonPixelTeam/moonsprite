import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from './I18nProvider'
import { TilemapLayerDialog } from './TilemapLayerDialog'
import { createSolidTileset } from '@/core/tilemap'

afterEach(() => cleanup())

describe('TilemapLayerDialog', () => {
  it('defaults to a new Tileset and submits a selected existing Tileset with its dimensions', async () => {
    const onConfirm = vi.fn(async () => {})
    const onClose = vi.fn()
    const tileset = createSolidTileset('shared-tileset', 'Shared Tiles', 3, 2, { r: 20, g: 40, b: 60, a: 255 }, 'tile-1')

    render(<I18nProvider><TilemapLayerDialog documentWidth={32} documentHeight={32} tilesets={[tileset]} onClose={onClose} onConfirm={onConfirm} /></I18nProvider>)

    const tilesetSelect = document.querySelector<HTMLButtonElement>('.tilemap-layer-dialog .themed-select-trigger')!
    expect(tilesetSelect).toHaveTextContent('新增瓦片集')
    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue('16')
    expect(screen.getAllByRole('spinbutton')[1]).toHaveValue('16')

    fireEvent.click(tilesetSelect)
    fireEvent.click(screen.getByRole('option', { name: /Shared Tiles/ }))

    expect(screen.getAllByRole('spinbutton')[0]).toHaveValue('3')
    expect(screen.getAllByRole('spinbutton')[1]).toHaveValue('2')
    fireEvent.click(screen.getByRole('button', { name: /创建 Tilemap/ }))

    expect(onConfirm).toHaveBeenCalledWith({ name: '瓦片图层', tileWidth: 3, tileHeight: 2, tilesetId: 'shared-tileset' })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
