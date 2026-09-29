import { readFileSync } from 'node:fs'
import { File } from 'node:buffer'
import { afterEach, expect, it, vi } from 'vitest'
import { decodeProject } from '@/core/project-format'
import { loadTrialExampleFile } from './trial-example-file'

afterEach(() => { vi.unstubAllGlobals() })

it('loads the supplied project intact as an importable browser file', async () => {
  const bytes = readFileSync('src/renderer/src/assets/trial-example.moonsprite')
  vi.stubGlobal('File', File)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes })))
  const file = await loadTrialExampleFile()
  expect(file.name).toBe('工程示例.moonsprite')
  const loaded = new Uint8Array(await file.arrayBuffer())
  expect(loaded).toEqual(new Uint8Array(bytes))
  const project = decodeProject(loaded)
  expect(project.layers.length).toBeGreaterThan(0)
  expect(project.width).toBeGreaterThan(0)
})

it('reports an unavailable example instead of opening an empty project', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
  await expect(loadTrialExampleFile()).rejects.toThrow('HTTP 404')
})
