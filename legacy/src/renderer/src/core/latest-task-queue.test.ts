import { describe, expect, it } from 'vitest'
import { LatestTaskQueue } from './latest-task-queue'

describe('latest generation acknowledgements', () => {
  it('runs only the active and latest values and acknowledges replaced callers after the last write', async () => {
    let releaseFirst!: () => void, releaseLast!: () => void
    const first = new Promise<void>(resolve => { releaseFirst = resolve })
    const last = new Promise<void>(resolve => { releaseLast = resolve })
    const seen: number[] = []
    let idles = 0, acknowledged = false
    const queue = new LatestTaskQueue<number>(async value => { seen.push(value); await (value === 0 ? first : last) }, () => { idles++ })
    const running = queue.enqueue(0), replaced = queue.enqueue(1)
    for (let value = 2; value <= 100; value++) expect(queue.enqueue(value)).toBe(replaced)
    void replaced.then(() => { acknowledged = true })
    expect(seen).toEqual([0])
    releaseFirst()
    await running
    expect(seen).toEqual([0, 100])
    expect(acknowledged).toBe(false)
    releaseLast()
    await replaced
    expect(acknowledged).toBe(true)
    expect(idles).toBe(1)
  })

  it('propagates latest failure to all pending callers and permits a retry', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const queue = new LatestTaskQueue<number>(async value => { if (value === 0) await gate; if (value === 2) throw new Error('disk full') }, () => {})
    const first = queue.enqueue(0), pending = queue.enqueue(1), latest = queue.enqueue(2)
    expect(pending).toBe(latest)
    const rejection = expect(pending).rejects.toThrow('disk full')
    release()
    await first
    await rejection
    await expect(queue.enqueue(3)).resolves.toBeUndefined()
  })
})
