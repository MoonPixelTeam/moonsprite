/** Complete a clipped rotation using simultaneous rounds. Indices and values
 * share the two original area-sized scratch buffers. Return candidate checks
 * so targeted performance validation can quantify work independently of time. */
export function fillSelectionRotationHoles(
  output: Uint32Array, width: number,
  candidateIndices: Uint32Array, candidateValues: Uint32Array, count: number
): number {
  let checks = 0
  while (count > 0) {
    checks += count
    // Partition unresolved holes from this round's additions in place.
    // Output stays unchanged until every candidate has been classified.
    let pending = count, cursor = 0
    while (cursor < pending) {
      const index = candidateIndices[cursor], col = index % width
      let neighbors = 0
      if (col > 0 && (output[index - 1] >>> 24) !== 0) neighbors += 1
      if (col + 1 < width && (output[index + 1] >>> 24) !== 0) neighbors += 1
      if (index >= width && (output[index - width] >>> 24) !== 0) neighbors += 1
      if (index + width < output.length && (output[index + width] >>> 24) !== 0) neighbors += 1
      if (neighbors < 2) { cursor += 1; continue }
      pending -= 1
      const value = candidateValues[cursor]
      candidateIndices[cursor] = candidateIndices[pending]
      candidateValues[cursor] = candidateValues[pending]
      candidateIndices[pending] = index
      candidateValues[pending] = value
    }
    if (pending === count) break
    for (let offset = pending; offset < count; offset += 1) output[candidateIndices[offset]] = candidateValues[offset]
    count = pending
  }
  return checks
}
