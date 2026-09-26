import { dispatchExtensionRuntimeEvent } from './extension-runtime'

const handlers = new Map<string, Set<string>>()
export const acceptsExtensionFileDrop = (path: string): boolean => {
  const suffix = /\.[^.\\/]+$/.exec(path)?.[0].toLowerCase()
  return Boolean(suffix && [...handlers.values()].some(types => types.has(suffix)))
}
export const clearExtensionFileDrop = (id: string): void => { handlers.delete(id) }
export function setExtensionFileDrop(id: string, suffixes: unknown): void {
  if (!Array.isArray(suffixes) || suffixes.length > 16 || suffixes.some(value => typeof value !== 'string' || !/^\.[a-z0-9]{1,16}$/i.test(value))) throw new Error('Invalid extension file-drop suffixes')
  handlers.set(id, new Set(suffixes.map(value => value.toLowerCase())))
}

/** Deliver only explicitly dropped files; extensions never receive arbitrary paths. */
export async function routeExtensionFileDrops(paths: readonly string[], read: (path: string) => Promise<Uint8Array>, report: (error: string) => void): Promise<string[]> {
  const remaining: string[] = []
  for (const path of paths) {
    const name = path.split(/[\\/]/).at(-1) ?? path
    const suffix = /\.[^.]+$/.exec(name)?.[0].toLowerCase()
    const owner = [...handlers].find(([, accepted]) => suffix && accepted.has(suffix))
    if (!owner) { remaining.push(path); continue }
    try {
      const bytes = await read(path)
      if (bytes.byteLength > 12 * 1024 * 1024) throw new Error('Extension import file exceeds 12 MiB')
      if (handlers.get(owner[0]) !== owner[1] || !dispatchExtensionRuntimeEvent(owner[0], { type: 'files-dropped', files: [{ name, bytes: Array.from(bytes) }] })) throw new Error('Extension file-drop handler is no longer available')
    } catch (error) { report(error instanceof Error ? error.message : String(error)) }
  }
  return remaining
}
