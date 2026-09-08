const supportedDocumentExtension = /\.(moonsprite(?:\.bak)?|msext|png|jpe?g|webp|bmp|gif|ase|aseprite)$/i

const normalizeDroppedPath = (value: string): string => {
  const trimmed = value.trim().replace(/^"|"$/g, '')
  if (!/^file:/i.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'file:') return trimmed
    const pathname = decodeURIComponent(url.pathname)
    if (url.hostname && url.hostname.toLowerCase() !== 'localhost') {
      return `\\\\${url.hostname}${pathname.replace(/\//g, '\\')}`
    }
    return pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
  } catch {
    return trimmed
  }
}

export const normalizeDroppedDocumentPaths = (paths: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of paths) {
    const path = normalizeDroppedPath(value)
    const key = path.toLowerCase()
    if (!path || !supportedDocumentExtension.test(path) || seen.has(key)) continue
    seen.add(key)
    result.push(path)
  }
  return result
}
