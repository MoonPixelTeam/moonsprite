import { useMemo, type CSSProperties } from 'react'
import { timelineSelectionContours, type TimelineSelectionBox } from './timeline-selection-contours'

export function TimelineSelectionOutlines({boxes, dragging}: {boxes: readonly TimelineSelectionBox[]; dragging: boolean}) {
  const contours = useMemo(() => timelineSelectionContours(boxes), [boxes])
  return <>{contours.map(box => <span key={`${box.row}:${box.column}`}
    data-animation-cel-selection
    data-animation-selection-contour={box.edges ? JSON.stringify({columns: box.columnSpan, rows: box.rowSpan, edges: box.edges}) : undefined}
    className={`animation-cel-selection-box${dragging ? ' animation-cel-drag-preview' : ''}`}
    style={{'--animation-frame-index': box.column, '--animation-frame-span': box.columnSpan,
      '--animation-row-index': box.row, '--animation-row-span': box.rowSpan,
      '--animation-row-top': `calc(var(--animation-header-height) + ${box.row} * var(--layer-row-height))`,
      '--animation-row-height': `calc(${box.rowSpan} * var(--layer-row-height))`,
      border: box.edges ? 'none' : undefined} as CSSProperties} aria-hidden="true">
    {box.edges && <svg width="100%" height="100%" viewBox={`0 0 ${box.columnSpan} ${box.rowSpan}`} preserveAspectRatio="none" style={{overflow: 'visible'}}>
      <path d={box.edges.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join(' ')}
        fill="none" stroke="var(--theme-accent)" strokeWidth="var(--timeline-selection-width)" strokeLinecap="square" vectorEffect="non-scaling-stroke" />
    </svg>}
  </span>)}</>
}
