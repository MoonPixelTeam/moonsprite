/*
 * Pack files.
 *
 * A buyer downloads the pack itself, so the file has to be stored somewhere that survives
 * a reload. It cannot be localStorage: pack archives run to megabytes and localStorage
 * holds strings against a ~5 MB origin quota, so a single upload would blow it up. Blobs
 * go to IndexedDB instead, which stores them natively and is measured in hundreds of MB.
 *
 * Same prototype caveat as the rest of src/api: this is one browser's IndexedDB. A real
 * backend would accept the upload once, store it, and serve it from a signed URL.
 */
import { api } from '../api'

const DB_NAME = 'moonsprite-files'
const DB_VERSION = 1
const STORE = 'packs'

export type StoredFile = {
  /** The product the file belongs to. */
  productId: string
  name: string
  type: string
  size: number
  blob: Blob
  updatedAt: number
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'productId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  return await new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE, mode)
    const request = work(transaction.objectStore(STORE))
    request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'))
    transaction.oncomplete = () => { database.close(); resolve(request.result) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('indexedDB transaction aborted')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('indexedDB transaction failed')) }
  })
}

export async function putFile(productId: string, file: File): Promise<StoredFile> {
  const record: StoredFile = {
    productId,
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    updatedAt: Date.now(),
  }
  await withStore('readwrite', (store) => store.put(record))
  // The store is the thing the market's download buttons read, so tell the app.
  window.dispatchEvent(new Event('moonsprite:files'))
  return record
}

export async function getFile(productId: string): Promise<StoredFile | undefined> {
  try {
    return await withStore<StoredFile | undefined>('readonly', (store) => store.get(productId) as IDBRequest<StoredFile | undefined>)
  } catch (error) {
    console.warn('MoonSprite files: could not read the stored pack file.', error)
    return undefined
  }
}

export async function removeFile(productId: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(productId))
  } catch (error) {
    console.warn('MoonSprite files: could not delete the stored pack file.', error)
  }
  window.dispatchEvent(new Event('moonsprite:files'))
}

/** Ids that have a file, for lists that need to know before rendering a download button. */
export async function listFileIds(): Promise<string[]> {
  try {
    const keys = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
    return keys.map((key) => String(key))
  } catch (error) {
    console.warn('MoonSprite files: could not list stored pack files.', error)
    return []
  }
}

/** Whether this build can store files at all. */
export function filesSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}

/**
 * Every download goes through here. A built-in pack ships a file in public/ and its
 * catalogue entry carries a `download` path; a studio pack has no path, so its bytes come
 * out of IndexedDB and are handed to the browser as an object URL, which is revoked once
 * the click has been dispatched.
 */
export async function downloadProduct(productId: string, fallbackPath: string | undefined, filename: string): Promise<boolean> {
  const orders = await api.orders.list()
  if (!orders.some((order) => order.lines.some((line) => line.id === productId))) return false
  const stored = await getFile(productId)
  if (stored) {
    const url = URL.createObjectURL(stored.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = stored.name || filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    // Revoking immediately can cancel the download in some browsers; a tick is enough.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  }
  if (!fallbackPath) return false
  const anchor = document.createElement('a')
  anchor.href = fallbackPath
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  return true
}
