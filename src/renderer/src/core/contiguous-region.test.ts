import { describe, expect, it } from 'vitest'
import { contiguousMatchingRegion, includeSmartClosurePixels } from './contiguous-region'

const gappedOutlineMask = (gap: number): { width: number; height: number; matching: Uint8Array } => {
  const width = 10
  const height = 10
  const matching = new Uint8Array(width * height).fill(1)
  const gapStart = 4
  for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 7; x += 1) {
    if (x === 2 || x === 7 || y === 2 || y === 7) matching[y * width + x] = 0
  }
  for (let x = gapStart; x < gapStart + gap; x += 1) matching[2 * width + x] = 1
  return { width, height, matching }
}

describe('contiguous smart-closure regions', () => {
  it('includes small enclosed pockets beside an active closure without absorbing the outside', () => {
    const width = 9
    const height = 7
    const matching = new Uint8Array(width * height)
    const selected = new Uint8Array(width * height)
    const virtualBarrier = new Uint8Array(width * height)
    for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 3; x += 1) {
      matching[y * width + x] = 1
      selected[y * width + x] = 1
    }
    for (let y = 1; y <= 5; y += 1) {
      matching[y * width + 4] = 1
      virtualBarrier[y * width + 4] = 1
    }
    for (let y = 1; y <= 2; y += 1) for (let x = 5; x <= 8; x += 1) matching[y * width + x] = 1
    matching[4 * width + 5] = 1
    matching[5 * width + 5] = 1

    includeSmartClosurePixels(selected, virtualBarrier, matching, width, height, 2)

    expect(selected[3 * width + 4]).toBe(1)
    expect(selected[4 * width + 5]).toBe(1)
    expect(selected[5 * width + 5]).toBe(1)
    expect(selected[1 * width + 8]).toBe(0)
  })



  it('bridges gaps up to the configured threshold', () => {
    const { width, height, matching } = gappedOutlineMask(2)
    const closed = contiguousMatchingRegion(width, height, 4, 4, (index) => matching[index] === 1, 2)!
    const tooSmall = contiguousMatchingRegion(width, height, 4, 4, (index) => matching[index] === 1, 1)!

    expect(closed[4 * width + 4]).toBe(1)
    expect(closed[0]).toBe(0)
    expect(closed[2 * width + 4]).toBe(1)
    expect(tooSmall[0]).toBe(1)
  })

  it('closes gaps in line art that is connected to the canvas edge', () => {
    const width = 12
    const height = 10
    const matching = new Uint8Array(width * height).fill(1)
    for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 9; x += 1) {
      if (x === 2 || x === 9 || y === 2 || y === 7) matching[y * width + x] = 0
    }
    matching[2 * width + 5] = 1
    matching[2 * width + 6] = 1
    for (let x = 0; x <= 2; x += 1) matching[5 * width + x] = 0

    const leaking = contiguousMatchingRegion(width, height, 5, 4, (index) => matching[index] === 1)!
    const closed = contiguousMatchingRegion(width, height, 5, 4, (index) => matching[index] === 1, 2)!

    expect(leaking[0]).toBe(1)
    expect(closed[5 * width + 5]).toBe(1)
    expect(closed[0]).toBe(0)
    expect(closed[2 * width + 5]).toBe(1)
  })



  it('skeletonizes thick strokes before searching for gap endpoints', () => {
    const width = 22
    const height = 18
    const matching = new Uint8Array(width * height).fill(1)
    for (let y = 3; y <= 14; y += 1) for (let x = 3; x <= 18; x += 1) {
      if (x <= 5 || x >= 16 || y <= 5 || y >= 12) matching[y * width + x] = 0
    }
    for (let y = 3; y <= 5; y += 1) for (let x = 9; x <= 12; x += 1) matching[y * width + x] = 1

    const tooSmall = contiguousMatchingRegion(width, height, 10, 8, (index) => matching[index] === 1, 3)!
    const closed = contiguousMatchingRegion(width, height, 10, 8, (index) => matching[index] === 1, 4)!
    const closedAtMaximum = contiguousMatchingRegion(width, height, 10, 8, (index) => matching[index] === 1, 16)!

    expect(tooSmall[0]).toBe(1)
    for (const region of [closed, closedAtMaximum]) {
      expect(region[0]).toBe(0)
      expect(region[8 * width + 10]).toBe(1)
      expect(region[4 * width + 9]).toBe(1)
      expect(region[4 * width + 12]).toBe(1)
    }
  })





  it('keeps a normal solid region intact beside canvas-edge background', () => {
    const width = 37
    const height = 27
    const matching = new Uint8Array(width * height)
    for (let y = 0; y < 22; y += 1) {
      for (let x = 0; x < 32; x += 1) matching[y * width + x] = 1
    }
    const normal = contiguousMatchingRegion(width, height, 16, 11, (index) => matching[index] === 1)!
    const smart = contiguousMatchingRegion(width, height, 16, 11, (index) => matching[index] === 1, 10)!

    expect([...smart]).toEqual([...normal])
  })

  it('closes the staggered circular gaps from the reported artwork without flattening the interior', () => {
    const rows = [
      '.....................................',
      '.....................................',
      '..............###########............',
      '...........###..........###..........',
      '.........###..............##.........',
      '........##..................##.......',
      '.......##....................##......',
      '......##......................#......',
      '......#.......................##.....',
      '.....#.........................#.....',
      '....##.........................##....',
      '....#...........................#....',
      '...##...........................#....',
      '...#.............................#...',
      '.................................#...',
      '.................................#...',
      '..#..............................#...',
      '..#..................................',
      '..#..............................#...',
      '..#..............................#...',
      '..#..............................#...',
      '..#..............................#...',
      '..#..............................#...',
      '..#.............................#....',
      '..##............................#....',
      '...#............................#....',
      '...##..........................##....',
      '....#.........................##.....',
      '....##.......................##......',
      '.....##.....................##.......',
      '......###..................##........',
      '........##...............###.........',
      '..........###.........####...........',
      '.............#######.##..............',
      '.....................................',
      '.....................................'
    ]
    const width = rows[0].length
    const height = rows.length
    const matching = Uint8Array.from(rows.join(''), (value) => value === '#' ? 0 : 1)
    const tooSmall = contiguousMatchingRegion(width, height, 18, 18, (index) => matching[index] === 1, 1)!
    const closed = contiguousMatchingRegion(width, height, 18, 18, (index) => matching[index] === 1, 2)!
    const closedAtMaximum = contiguousMatchingRegion(width, height, 18, 18, (index) => matching[index] === 1, 16)!

    expect(tooSmall[0]).toBe(1)
    for (const region of [closed, closedAtMaximum]) {
      expect(region[0]).toBe(0)
      expect(region[18 * width + 18]).toBe(1)
      expect(region[14 * width + 4]).toBe(1)
      expect(region[17 * width + 31]).toBe(1)
      expect(region[32 * width + 18]).toBe(1)
      expect(region[14 * width + 3]).toBe(1)
      expect(region[17 * width + 33]).toBe(1)
      expect(region[33 * width + 20]).toBe(1)
    }
  })


})
