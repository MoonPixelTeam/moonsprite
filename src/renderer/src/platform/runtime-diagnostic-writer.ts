import type { RuntimeDiagnosticEvent } from '@/core/runtime-diagnostics'

const BATCH_DELAY_MS = 250
const MAX_BATCH_EVENTS = 100 // Matches append_diagnostic_events on the native side.
const MAX_PENDING_EVENTS = 500

const importantEvent = (event: RuntimeDiagnosticEvent): boolean => event.kind === 'error'
  || event.kind === 'operation-slow'
  || event.kind === 'main-thread-stall'
  || event.kind === 'long-task'
  || (event.kind === 'operation-end' && event.detail.outcome === 'error')

export const createDiagnosticWriter = (
  persist: (events: readonly RuntimeDiagnosticEvent[]) => Promise<void>,
  fallback: (events: readonly RuntimeDiagnosticEvent[]) => void
) => {
  const pending: RuntimeDiagnosticEvent[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let inFlight: RuntimeDiagnosticEvent[] = []
  let droppedEvents = 0
  let generation = 0
  const cancelTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  const flush = (): Promise<void> => {
    cancelTimer()
    if (running) return running
    if (!pending.length) return Promise.resolve()
    const drain = async (): Promise<void> => {
      while (pending.length) {
        inFlight = pending.splice(0, MAX_BATCH_EVENTS)
        if (droppedEvents > 0) {
          inFlight[0] = {
            ...inFlight[0],
            detail: {
              ...inFlight[0].detail,
              diagnosticWriterDroppedEvents: droppedEvents,
              diagnosticWriterPendingLimit: MAX_PENDING_EVENTS
            }
          }
          droppedEvents = 0
        }
        const batchGeneration = generation
        try {
          await persist(inFlight)
        } catch {
          if (batchGeneration === generation) fallback(inFlight)
        } finally {
          inFlight = []
        }
        // Yield between batches, including when browser persistence is synchronous.
        if (pending.length) await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
    running = drain().finally(() => {
      running = undefined
      // An enqueue can occur between the last await and this completion callback.
      if (pending.length) return flush()
    })
    return running
  }
  const enqueue = (events: readonly RuntimeDiagnosticEvent[]): void => {
    let urgent = false
    for (const event of events) {
      const important = importantEvent(event)
      urgent ||= important
      if (pending.length < MAX_PENDING_EVENTS) {
        pending.push(event)
        continue
      }
      if (!important) {
        droppedEvents += 1
        continue
      }
      const replaceIndex = pending.findIndex((item) => !importantEvent(item))
      if (replaceIndex >= 0) pending.splice(replaceIndex, 1)
      else pending.shift()
      pending.push(event)
      droppedEvents += 1
    }
    if (urgent) {
      void flush()
    } else if (!running && timer === undefined) {
      timer = setTimeout(() => { void flush() }, BATCH_DELAY_MS)
    }
  }
  // Page teardown cannot await native IPC. Keep an emergency browser copy,
  // without removing the events from the normal ordered persistence queue.
  const checkpoint = (): void => {
    const events = [...inFlight, ...pending]
    if (events.length) fallback(events)
  }
  const discardPending = (): void => {
    generation++
    cancelTimer()
    pending.length = 0
    inFlight = []
    droppedEvents = 0
  }
  return { enqueue, flush, checkpoint, discardPending }
}
