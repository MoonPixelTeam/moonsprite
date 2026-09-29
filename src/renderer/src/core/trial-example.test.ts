import { expect, it } from 'vitest'
import { createTrialExample } from './trial-example'
import { encodeProject, decodeProject } from './project-format'

it('creates independent editable layers that survive project saving', () => {
  const first = createTrialExample()
  const second = createTrialExample()
  expect(first.id).not.toBe(second.id)
  expect(first.layers[0].pixels).not.toBe(second.layers[0].pixels)
  const reopened = decodeProject(encodeProject(first))
  expect(reopened).toMatchObject({ width: 32, height: 32 })
  expect(reopened.layers.map(layer => layer.name)).toEqual(['夜空', '月亮与星光'])
  expect(reopened.animation?.cels).toHaveLength(2)
  expect(reopened.layers[1].pixels).toEqual(first.layers[1].pixels)
})
