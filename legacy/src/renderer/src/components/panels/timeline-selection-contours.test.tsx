import type { PointerEvent as ReactPointerEvent } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { timelineSelectionContours } from './timeline-selection-contours'
import { TimelineSelectionOutlines } from './TimelineSelectionOutlines'
import { timelineSelectionOutlineHit } from './animation-gesture-helpers'

afterEach(cleanup)

const tee = [
  {row: 0, column: 23, rowSpan: 3, columnSpan: 5},
  {row: 3, column: 18, rowSpan: 1, columnSpan: 27}
]

it('merges adjacent and overlapping rows into a single rectangular outline', () => {
  expect(timelineSelectionContours([
    {row: 0, column: 23, rowSpan: 2, columnSpan: 5},
    {row: 1, column: 23, rowSpan: 2, columnSpan: 5}
  ])).toEqual([{row: 0, column: 23, rowSpan: 3, columnSpan: 5}])
})

it('draws only the exterior of frames 24–28 joined to a longer bottom linked run', () => {
  const contours = timelineSelectionContours(tee)
  expect(contours).toHaveLength(1)
  expect(contours[0]).toMatchObject({row: 0, column: 18, rowSpan: 4, columnSpan: 27})
  expect(contours[0].edges).toEqual(expect.arrayContaining([
    [5, 0, 10, 0], [0, 3, 5, 3], [10, 3, 27, 3], [0, 4, 27, 4]
  ]))
  const horizontal = contours[0].edges!.filter(([, y1, , y2]) => y1 === y2)
  expect(horizontal).toHaveLength(4)
})

it('retains disconnected and diagonal-only regions as separate outlines', () => {
  expect(timelineSelectionContours([
    {row: 0, column: 0, rowSpan: 1, columnSpan: 2},
    {row: 0, column: 3, rowSpan: 1, columnSpan: 1},
    {row: 1, column: 4, rowSpan: 1, columnSpan: 1}
  ])).toHaveLength(3)
})

it('preserves the border around a hole without filling the unselected cell', () => {
  const contours = timelineSelectionContours([
    {row: 0, column: 0, rowSpan: 1, columnSpan: 3},
    {row: 1, column: 0, rowSpan: 1, columnSpan: 1},
    {row: 1, column: 2, rowSpan: 1, columnSpan: 1},
    {row: 2, column: 0, rowSpan: 1, columnSpan: 3}
  ])
  expect(contours).toHaveLength(1)
  expect(contours[0].edges).toEqual(expect.arrayContaining([
    [1, 1, 2, 1], [1, 2, 2, 2], [1, 1, 1, 2], [2, 1, 2, 2]
  ]))
})

it('hits the rendered shoulders and sides, but not removed seams or empty bounding-box edges', () => {
  const {container} = render(<TimelineSelectionOutlines boxes={tee} dragging={false} />)
  const outlines = container.querySelectorAll<HTMLElement>('[data-animation-cel-selection]')
  expect(outlines).toHaveLength(1)
  expect(outlines[0].querySelector('path')).toHaveAttribute('vector-effect', 'non-scaling-stroke')
  vi.spyOn(outlines[0], 'getBoundingClientRect').mockReturnValue({
    left: 100, top: 50, right: 640, bottom: 130, width: 540, height: 80,
    x: 100, y: 50, toJSON: () => ({})
  })
  const hit = (clientX: number, clientY: number) => timelineSelectionOutlineHit(
    {current: container as HTMLDivElement}, {clientX, clientY} as ReactPointerEvent<HTMLElement>, '[data-animation-cel-selection]')
  expect(hit(150, 110)).toBe(true) // left shoulder
  expect(hit(400, 110)).toBe(true) // right shoulder
  expect(hit(200, 80)).toBe(true) // upper vertical side
  expect(hit(640, 120)).toBe(true) // linked run's right side
  expect(hit(250, 70)).toBe(false) // former row divider
  expect(hit(250, 110)).toBe(false) // overlap with linked row
  expect(hit(100, 70)).toBe(false) // empty bounding-box side
  expect(hit(150, 50)).toBe(false) // empty bounding-box top
})
