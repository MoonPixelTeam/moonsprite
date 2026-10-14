/** Aseprite-style detection: matching names and consecutive trailing numbers, not visual similarity. */
export function imageSequenceBatches(paths: readonly string[]): string[][] {
  const groups = new Map<string, { path: string; number: number; digits: string }[]>()
  const seenPaths = new Set<string>()
  const unique = paths.filter((path) => {
    const key = path.replaceAll('\\', '/').toLowerCase()
    if (seenPaths.has(key)) return false
    seenPaths.add(key)
    return true
  })
  for (const path of unique) {
    const match = /^(.*?)(\d+)(\.(?:png|jpe?g|bmp|webp))$/i.exec(path.replaceAll('\\', '/'))
    if (!match || !Number.isSafeInteger(Number(match[2]))) continue
    const key = `${match[1]}\0${match[3]}`.toLowerCase()
    const group = groups.get(key) ?? []
    group.push({ path, number: Number(match[2]), digits: match[2] })
    groups.set(key, group)
  }
  const sequenceFor = new Map<string, string[]>()
  for (const group of groups.values()) {
    group.sort((a, b) => a.number - b.number)
    let run: typeof group = []
    const flush = (): void => {
      if (run.length > 1) {
        const batch = run.map((item) => item.path)
        for (const item of run) sequenceFor.set(item.path, batch)
      }
    }
    for (const item of group) {
      const previous = run.at(-1)
      if (previous && (item.number !== previous.number + 1 || item.digits !== String(item.number).padStart(previous.digits.length, '0'))) {
        flush(); run = []
      }
      run.push(item)
    }
    flush()
  }
  const batches: string[][] = []
  const seen = new Set<string>()
  for (const path of unique) {
    if (seen.has(path)) continue
    const batch = sequenceFor.get(path) ?? [path]
    batches.push(batch)
    batch.forEach((item) => seen.add(item))
  }
  return batches
}
