import type { SpriteDocument } from '@shared/types'
import { decodeAseprite } from '@/core/aseprite'
import { decodePsd } from '@/core/psd'
import { setRuntimeAppLocale, type AppLocale } from '@/core/localization'
import { decodeProject } from '@/core/project-format'
import { compositeDocument } from '@/core/document'
import { canPrepareInitialDocumentComposite } from '@/core/initial-document-composite'
import { prepareRuntimeRasterDocumentForTransfer, prepareRuntimeRasterMetadata, rehydrateRuntimeRasterDocument } from '@/core/runtime-raster'

export interface DecodeWorkerRequest {
  id: number
  data: Uint8Array
  filePath: string
  locale: AppLocale
  prepareInitialComposite?: boolean
  reportProgress?: boolean
}

export interface DecodeWorkerResponse {
  id: number
  document?: SpriteDocument
  initialComposite?: Uint8ClampedArray
  initialCompositePending?: boolean
  completed?: boolean
  error?: string
  progress?: number
}

const fileNameFromPath = (filePath: string): string => filePath.split(/[\\/]/).pop() ?? filePath
const fileExtension = (filePath: string): string => filePath.split('.').pop()?.toLowerCase() ?? ''
const isMoonSpriteBackupPath = (filePath: string): boolean => /\.moonsprite\.bak$/i.test(filePath)
const isMoonSpriteProjectPath = (filePath: string): boolean => /\.moonsprite(?:\.bak)?$/i.test(filePath)

const collectTransferables = (root: unknown): Transferable[] => {
  const buffers = new Set<ArrayBuffer>()
  const visited = new WeakSet<object>()
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (ArrayBuffer.isView(value)) {
      if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
      return
    }
    if (value instanceof ArrayBuffer) {
      buffers.add(value)
      return
    }
    if (visited.has(value)) return
    visited.add(value)
    if (Array.isArray(value)) for (const item of value) visit(item)
    else for (const item of Object.values(value)) visit(item)
  }
  visit(root)
  return [...buffers]
}

const createInitialCompositeSnapshot = (document: SpriteDocument): SpriteDocument => {
  const animation = document.animation
    ? {
        ...document.animation,
        cels: document.animation.cels.map((cel) => ({
          id: cel.id,
          layerId: cel.layerId,
          frameId: cel.frameId,
          ...(cel.linkedCelId !== undefined ? { linkedCelId: cel.linkedCelId } : {}),
          ...(cel.opacity !== undefined ? { opacity: cel.opacity } : {})
        }))
      }
    : undefined
  return structuredClone({
    ...document,
    customBrushes: [],
    tilesets: [],
    slices: [],
    timelapse: document.timelapse ? { ...document.timelapse, snapshots: [] } : undefined,
    animation
  })
}

type DecodeWorkerPostMessage = (message: DecodeWorkerResponse, transfer: Transferable[]) => void
type DeferDecodeWork = (work: () => void) => void

export const processDocumentDecodeRequest = (
  request: DecodeWorkerRequest,
  postMessage: DecodeWorkerPostMessage,
  defer: DeferDecodeWork = (work) => { globalThis.setTimeout(work, 0) }
): void => {
  const { id, data, filePath, locale, prepareInitialComposite = true, reportProgress = false } = request
  setRuntimeAppLocale(locale)
  try {
    const suffix = fileExtension(filePath)
    const fileName = fileNameFromPath(filePath)
    const project = isMoonSpriteProjectPath(filePath)
    const backup = isMoonSpriteBackupPath(filePath)
    const reportDecodeProgress = (progress: number): void => {
      if (reportProgress) postMessage({ id, progress: prepareInitialComposite ? progress * 0.9 : progress }, [])
    }
    const document = project
      ? decodeProject(data, reportDecodeProgress)
      : suffix === 'psd'
        ? decodePsd(data, fileName.replace(/\.psd$/i, ''), reportDecodeProgress)
      : decodeAseprite(data, fileName.replace(/\.(aseprite|ase)$/i, ''), reportDecodeProgress)
    document.filePath = project && !backup ? filePath : null
    document.sourceFilePath = backup ? undefined : filePath
    document.name = backup ? fileName.replace(/\.bak$/i, '') : fileName

    const shouldPrepareInitialComposite = prepareInitialComposite && canPrepareInitialDocumentComposite(document.width, document.height)
    prepareRuntimeRasterMetadata(document)
    prepareRuntimeRasterDocumentForTransfer(document)

    let compositeSnapshot: SpriteDocument | null = null
    if (shouldPrepareInitialComposite) {
      try {
        compositeSnapshot = createInitialCompositeSnapshot(document)
        rehydrateRuntimeRasterDocument(compositeSnapshot)
      } catch {
        compositeSnapshot = null
      }
    }

    if (reportProgress) postMessage({ id, progress: 1 }, [])
    const response = { id, document, ...(compositeSnapshot ? { initialCompositePending: true } : {}) }
    postMessage(response, collectTransferables(response))
    if (!compositeSnapshot) return
    const snapshot = compositeSnapshot

    defer(() => {
      try {
        const initialComposite = compositeDocument(snapshot)
        const compositeResponse = { id, initialComposite, completed: true }
        postMessage(compositeResponse, collectTransferables(compositeResponse))
      } catch (error) {
        postMessage({ id, completed: true, error: error instanceof Error ? error.message : String(error) }, [])
      }
    })
  } catch (error) {
    postMessage({ id, error: error instanceof Error ? error.message : String(error) }, [])
  }
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<DecodeWorkerRequest>) => void) | null
  postMessage: (message: DecodeWorkerResponse, transfer: Transferable[]) => void
}

scope.onmessage = (event): void => {
  processDocumentDecodeRequest(event.data, (message, transfer) => scope.postMessage(message, transfer))
}
