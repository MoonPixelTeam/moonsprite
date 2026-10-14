const MAX_ASSET_BYTES = 8 * 1024 * 1024
const MAX_EXTENSION_BYTES = 64 * 1024 * 1024
const database = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = indexedDB.open('moonsprite-extension-assets', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('assets').createIndex('extension', 'extensionId')
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
export const extensionAssetKey = (extensionId: string, key: unknown): string => {
  if (typeof key !== 'string' || !key || new TextEncoder().encode(key).length > 160 || /[\u0000-\u001f]/.test(key)) throw new Error('扩展素材键无效。')
  return JSON.stringify([extensionId, key])
}
export const extensionAssetSize = (value: unknown): number => {
  if (typeof value !== 'string') throw new Error('扩展素材必须是字符串。')
  const bytes = new TextEncoder().encode(value).length
  if (bytes > MAX_ASSET_BYTES) throw new Error('转换后的素材超过 8 MiB，请缩小尺寸或减少帧数。')
  return bytes
}
export const extensionAssets = (extensionId: string) => ({
  async get(key: unknown): Promise<string | null> {
    const id = extensionAssetKey(extensionId, key), db = await database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets'), request = tx.objectStore('assets').get(id)
      tx.oncomplete = () => { db.close(); resolve(request.result?.value ?? null) }
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('读取扩展素材失败。')) }
    })
  },
  async set(key: unknown, value: unknown): Promise<void> {
    const id = extensionAssetKey(extensionId, key), bytes = extensionAssetSize(value), db = await database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite'), store = tx.objectStore('assets')
      let failure: Error | null = null
      // The quota read and write share one transaction, including across windows.
      const request = store.index('extension').openCursor(IDBKeyRange.only(extensionId))
      let total = bytes
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) { if (cursor.primaryKey !== id) total += cursor.value.bytes; cursor.continue(); return }
        if (total > MAX_EXTENSION_BYTES) { failure = new Error('扩展素材总容量超过 64 MiB，请删除不用的素材。'); tx.abort(); return }
        store.put({ extensionId, value, bytes }, id)
      }
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error('保存扩展素材失败。')) }
    })
  },
  async remove(key: unknown): Promise<void> {
    const id = extensionAssetKey(extensionId, key), db = await database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('assets', 'readwrite')
      tx.objectStore('assets').delete(id)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('删除扩展素材失败。')) }
    })
  }
})
