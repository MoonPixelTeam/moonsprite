import type { RgbaColor } from '@shared/types-color'

type Sampler = (x: number, y: number) => RgbaColor | null
const samplers = new Map<string, Set<Sampler>>()
export function registerReferenceSampler(documentId: string, sample: Sampler): () => void {
  const group = samplers.get(documentId) ?? new Set<Sampler>()
  group.add(sample)
  samplers.set(documentId, group)
  return () => { group.delete(sample); if (!group.size) samplers.delete(documentId) }
}
export function sampleReferenceColor(documentId: string, x: number, y: number): RgbaColor | null {
  for (const sample of samplers.get(documentId) ?? []) {
    const color = sample(x, y)
    if (color) return color
  }
  return null
}
