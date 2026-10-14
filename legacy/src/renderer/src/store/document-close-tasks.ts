type CloseTask = { key: string; completion: Promise<void> }
const tasks = new Set<CloseTask>()
const pathKey = (path: string): string => path.trim().replaceAll('/', '\\').toLocaleLowerCase()

/** Keep durability work alive after its tab disappears; reopening/exit join it. */
export function startDocumentCloseTask(path: string, work: () => Promise<void>, onError: (error: unknown) => void): void {
  const completion = Promise.resolve().then(work)
  const task = { key: pathKey(path), completion }
  tasks.add(task)
  void completion.then(() => { tasks.delete(task) }, error => {
    // Restore/report before removing the barrier, including when exit is waiting.
    try { onError(error) } finally { tasks.delete(task) }
  })
}

export async function waitForDocumentCloseTasks(path?: string): Promise<void> {
  const key = path === undefined ? undefined : pathKey(path)
  for (;;) {
    const pending = [...tasks].filter(task => key === undefined || task.key === key)
    if (!pending.length) return
    await Promise.all(pending.map(task => task.completion))
  }
}
