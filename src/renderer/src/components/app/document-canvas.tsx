import { lazy, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWorkspace } from '@/store/workspace'
import { canvasSessionRenderState } from './document-canvas-state'

const loadCanvasStage = () => import('@/components/CanvasStage').then(({ CanvasStage }) => ({ default: CanvasStage }))
const LazyCanvasStage = lazy(loadCanvasStage)

export const preloadCanvasStage = (): void => { void loadCanvasStage() }

/** Session objects mutate in place: subscribe to values, never their identity alone. */
export const DocumentCanvas = memo(function DocumentCanvas({ documentId }: { documentId: string }) {
  useWorkspace(useShallow((state) => canvasSessionRenderState(state.sessions.find((session) => session.document.id === documentId))))
  const session = useWorkspace.getState().sessions.find((candidate) => candidate.document.id === documentId)
  return session ? <LazyCanvasStage session={session} /> : null
})
