import type { PublishInput } from '../api/types'

/** Retain the minted id before uploading, so a failed upload retries the same listing. */
export async function saveListing({ studio, payload, savedId, file, rememberId, putFile }: {
  studio: {
    publish: (input: PublishInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>
    update: (id: string, input: PublishInput) => Promise<{ ok: true } | { ok: false; error: string }>
  }
  payload: PublishInput
  savedId?: string
  file: File | null
  rememberId: (id: string) => void
  putFile: (id: string, file: File) => Promise<unknown>
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let id = savedId
  if (id) {
    const result = await studio.update(id, payload)
    if (!result.ok) return result
  } else {
    const result = await studio.publish(payload)
    if (!result.ok) return result
    id = result.id
    rememberId(id)
  }
  if (file) {
    try { await putFile(id, file) }
    catch (error) {
      console.warn('MoonSprite studio: could not store the pack file.', error)
      return { ok: false, error: 'file' }
    }
  }
  return { ok: true }
}
