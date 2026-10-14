export interface PixelLinePoint { x: number; y: number }

export function constrainLineEndpoint(from: PixelLinePoint, to: PixelLinePoint, stairStep = 1): PixelLinePoint {
  const deltaX = to.x - from.x
  const deltaY = to.y - from.y
  if (deltaX === 0 && deltaY === 0) return { ...to }
  const step = Math.max(1, Math.min(16, Math.round(stairStep)))
  const directions = [
    { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
    { x: step, y: 1 }, { x: 1, y: step }, { x: -1, y: step }, { x: -step, y: 1 },
    { x: -step, y: -1 }, { x: -1, y: -step }, { x: 1, y: -step }, { x: step, y: -1 }
  ].filter((direction, index, all) => all.findIndex((candidate) => candidate.x === direction.x && candidate.y === direction.y) === index)
  const length = Math.hypot(deltaX, deltaY)
  const direction = directions.reduce((best, candidate) => {
    const score = (deltaX * candidate.x + deltaY * candidate.y) / (length * Math.hypot(candidate.x, candidate.y))
    return score > best.score ? { value: candidate, score } : best
  }, { value: directions[0], score: Number.NEGATIVE_INFINITY }).value
  const diagonal = direction.x !== 0 && direction.y !== 0
  if (diagonal && step > 1) {
    const xMajor = Math.abs(direction.x) > Math.abs(direction.y)
    const majorDelta = Math.abs(xMajor ? deltaX : deltaY)
    const minorDelta = Math.abs(xMajor ? deltaY : deltaX)
    const stairCount = Math.max(1, Math.round((step * (majorDelta + 1) + minorDelta + 1) / (step * step + 1)))
    const constrainedMajor = stairCount * step - 1
    const constrainedMinor = stairCount - 1
    return xMajor
      ? { x: from.x + Math.sign(direction.x) * constrainedMajor, y: from.y + Math.sign(direction.y) * constrainedMinor }
      : { x: from.x + Math.sign(direction.x) * constrainedMinor, y: from.y + Math.sign(direction.y) * constrainedMajor }
  }
  const scale = Math.abs(direction.x) >= Math.abs(direction.y) && direction.x !== 0
    ? Math.abs(deltaX / direction.x)
    : Math.abs(deltaY / direction.y)
  return {
    x: from.x + Math.round(direction.x * scale),
    y: from.y + Math.round(direction.y * scale)
  }
}

/**
 * 将主轴像素平均分配到每一级台阶，避免 Bresenham 在线段两端产生明显短阶。
 * 计算始终从主轴较小的一端开始，因此反向绘制会得到完全相同的像素集合。
 */
export function balancedStairLinePoints(from: PixelLinePoint, to: PixelLinePoint): PixelLinePoint[] {
  const deltaX = Math.abs(to.x - from.x)
  const deltaY = Math.abs(to.y - from.y)
  const xMajor = deltaX >= deltaY
  const reverse = xMajor ? from.x > to.x : from.y > to.y
  const start = reverse ? to : from
  const end = reverse ? from : to
  const majorLength = (xMajor ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)) + 1
  const minorSteps = xMajor ? Math.abs(end.y - start.y) : Math.abs(end.x - start.x)
  const stairCount = minorSteps + 1
  const minorDirection = xMajor
    ? end.y >= start.y ? 1 : -1
    : end.x >= start.x ? 1 : -1
  const points: PixelLinePoint[] = []
  let majorOffset = 0

  for (let stair = 0; stair < stairCount; stair += 1) {
    const stairEnd = Math.floor(((stair + 1) * majorLength) / stairCount)
    while (majorOffset < stairEnd) {
      points.push(xMajor
        ? { x: start.x + majorOffset, y: start.y + stair * minorDirection }
        : { x: start.x + stair * minorDirection, y: start.y + majorOffset })
      majorOffset += 1
    }
  }

  return reverse ? points.reverse() : points
}
