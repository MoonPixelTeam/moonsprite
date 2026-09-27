import type { MoonSpriteApi } from '@shared/types-platform'

type Recovery = { id: string; name: string; data: Uint8Array; updatedAt: string }

// A transaction resolves only after commit: quota errors must reach the caller.
export async function browserStorage<T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('moonsprite-web-trial', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('files', 'readwrite')
      const request = operation(transaction.objectStore('files'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('Browser storage transaction aborted'))
      transaction.onerror = () => reject(transaction.error ?? request.error)
    })
  } finally { db.close() }
}

export function createBrowserFiles() {
  const files = new Map<string, Blob>()
  const paths = new WeakMap<File, string>()
  const pathForFile = (file: File): string => {
    const existing = paths.get(file)
    if (existing) return existing
    const path = `imports/${crypto.randomUUID()}/${file.name}`
    paths.set(file, path)
    files.set(path, file)
    return path
  }
  const pick = (accept: string): ReturnType<MoonSpriteApi['openFiles']> => new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = accept
    input.hidden = true
    const finish = (selected: File[]) => {
      input.remove()
      resolve({ canceled: selected.length === 0, filePaths: selected.map(pathForFile) })
    }
    input.onchange = () => finish(Array.from(input.files ?? []))
    input.oncancel = () => finish([])
    document.body.append(input)
    input.click()
  })
  const save = async (defaultPath = 'Untitled.moonsprite', extension?: string) => {
    let name = defaultPath.split(/[\\/]/).pop() || 'Untitled.moonsprite'
    if (extension && !name.toLowerCase().endsWith(`.${extension}`)) name = `${name.replace(/\.[^.]+$/, '')}.${extension}`
    return { canceled: false, filePath: `downloads/${name}` }
  }
  const readBinary = async (path: string): Promise<Uint8Array> => {
    const file = files.get(path)
    if (!file) throw new Error('文件已不在当前浏览器会话中，请重新导入。 / Please import this file again.')
    return new Uint8Array(await file.arrayBuffer())
  }
  const writeBinaryAtomic = async (path: string, data: Uint8Array): Promise<void> => {
    const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = path.split(/[\\/]/).pop() || 'Untitled.moonsprite'
      document.body.append(anchor)
      try { anchor.click() } finally { anchor.remove() }
      files.set(path, blob)
    } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000) }
  }
  const readRecovery = async (id: string) => {
    const item = await browserStorage<Recovery | undefined>((store) => store.get(`recovery:${id}`))
    if (!item) throw new Error('Recovery not found')
    return item.data
  }
  return {
    pathForFile, readBinary, writeBinaryAtomic,
    openFiles: () => pick('.moonsprite,.ase,.aseprite,.psd,.png,.jpg,.jpeg,.webp,.gif,.bmp,.ico,.svg'),
    openBrushImages: () => pick('image/*'),
    saveProject: save,
    exportImage: save,
    savePaletteImage: (path?: string) => save(path ?? 'palette.png', 'png'),
    saveShortcutFile: (path?: string) => save(path ?? 'shortcuts.json', 'json'),
    saveThemeFile: (path?: string) => save(path ?? 'theme.json', 'json'),
    saveUsageStatisticsFile: (path?: string) => save(path ?? 'statistics.json', 'json'),
    fileExists: async (path: string) => files.has(path),
    readRecovery,
    writeRecovery: async (id: string, name: string, data: Uint8Array) => {
      await browserStorage((store) => store.put({ id, name, data, updatedAt: new Date().toISOString() } satisfies Recovery, `recovery:${id}`))
    },
    deleteRecovery: async (id: string) => { await browserStorage((store) => store.delete(`recovery:${id}`)) },
    listRecoveries: async (_retentionDays: number) => {
      const items = await browserStorage<unknown[]>((store) => store.getAll(IDBKeyRange.bound('recovery:', 'recovery:\uffff')))
      // Keep old recoveries until explicitly removed; never silently discard artwork.
      return items.filter((item): item is Recovery => !!item && typeof item === 'object' && 'updatedAt' in item && 'id' in item)
        .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    },
    readLocalHistory: async (id: string) => {
      const data = await browserStorage<Uint8Array | undefined>((store) => store.get(`history:${id}`))
      if (!data) throw new Error('Local history not found')
      return data
    },
    writeLocalHistory: async (id: string, data: Uint8Array) => { await browserStorage((store) => store.put(data, `history:${id}`)) },
    deleteLocalHistory: async (id: string) => { await browserStorage((store) => store.delete(`history:${id}`)) },
    confirmUnsaved: async (name: string): Promise<'save' | 'discard' | 'cancel'> => {
      if (window.confirm(`保存 ${name}？ / Save ${name}?`)) return 'save'
      return window.confirm('放弃未保存的修改？ / Discard unsaved changes?') ? 'discard' : 'cancel'
    }
  } satisfies Partial<MoonSpriteApi>
}
