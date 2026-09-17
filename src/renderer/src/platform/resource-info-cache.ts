import type { ResourceInfo } from '@shared/types-files'

interface ResourceInfoReaderOptions {
  refreshAfterMs?: number
  now?: () => number
}

export function createResourceInfoReader(
  load: () => Promise<ResourceInfo>,
  options: ResourceInfoReaderOptions = {},
): () => Promise<ResourceInfo> {
  const refreshAfterMs = options.refreshAfterMs ?? 30_000
  const now = options.now ?? Date.now
  let cached: ResourceInfo | null = null
  let loadedAt = 0
  let pending: Promise<ResourceInfo> | null = null

  const refresh = (): Promise<ResourceInfo> => {
    if (pending) return pending
    pending = load().then((info) => {
      cached = info
      loadedAt = now()
      return info
    }).finally(() => { pending = null })
    return pending
  }

  return (): Promise<ResourceInfo> => {
    if (!cached) return refresh()
    if (now() - loadedAt >= refreshAfterMs) void refresh().catch(() => {})
    return Promise.resolve(cached)
  }
}
