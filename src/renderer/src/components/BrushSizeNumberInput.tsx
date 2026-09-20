import { useSyncExternalStore, type ComponentProps } from 'react'
import type { DocumentSession } from '@/store/workspace-types'
import { NumberInput } from './NumberInput'
import { canvasBrushSizePreview, subscribeCanvasBrushSizePreview } from './canvas-brush-size-update'

/** Only the numeric field rerenders while the canvas owns a sizing gesture. */
export function BrushSizeNumberInput({ documentId, tool, ...props }: ComponentProps<typeof NumberInput> & {
  documentId: string
  tool: DocumentSession['tool']
}) {
  const preview = useSyncExternalStore(subscribeCanvasBrushSizePreview, () => canvasBrushSizePreview(documentId, tool))
  return <NumberInput {...props} value={preview ?? props.value} />
}
