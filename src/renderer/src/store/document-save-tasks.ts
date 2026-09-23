type SaveTask = { documentId: string; completion: Promise<boolean> }
const tasks = new Set<SaveTask>()

/** Track the entire save, including recording flushes and the final dirty update. */
export function runDocumentSave(documentId: string, work: () => Promise<boolean>): Promise<boolean> {
  let start!: () => void
  const completion = new Promise<boolean>((resolve, reject) => {
    start = () => { try { resolve(work()) } catch (error) { reject(error) } }
  })
  const task = { documentId, completion }
  tasks.add(task)
  void completion.then(() => tasks.delete(task), () => tasks.delete(task))
  start()
  return completion
}

/** Drain saves started while waiting too; a failed or canceled save blocks this close. */
export async function waitForDocumentSaves(documentId?: string): Promise<boolean> {
  let succeeded = true
  for (;;) {
    const pending = [...tasks].filter(task => documentId === undefined || task.documentId === documentId)
    if (!pending.length) return succeeded
    const results = await Promise.all(pending.map(task => task.completion))
    succeeded = results.every(Boolean) && succeeded
  }
}
