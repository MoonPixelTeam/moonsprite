/** One running generation and one replaceable pending generation. All callers
 * of the pending slot share its acknowledgement; none retain replaced data. */
export class LatestTaskQueue<T> {
  private running = false
  private active?: T
  private pending?: { value: T; promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void }

  constructor(private readonly run: (value: T) => Promise<void>, private readonly onIdle: () => void) {}

  get pendingValue(): T | undefined { return this.pending?.value }
  get runningValue(): T | undefined { return this.active }

  enqueue(value: T): Promise<void> {
    if (!this.running) {
      this.running = true
      return this.execute(value)
    }
    if (this.pending) {
      this.pending.value = value
      return this.pending.promise
    }
    let resolve!: () => void, reject!: (error: unknown) => void
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
    this.pending = { value, promise, resolve, reject }
    return promise
  }

  private async execute(value: T): Promise<void> {
    this.active = value
    try { await this.run(value) }
    finally {
      const next = this.pending
      this.pending = undefined
      if (next) {
        void this.execute(next.value).then(next.resolve, next.reject)
      } else {
        this.running = false
        this.active = undefined
        this.onIdle()
      }
    }
  }
}
