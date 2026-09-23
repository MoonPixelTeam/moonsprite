import { afterEach, expect, it } from 'vitest'
import { parseTabletPreferences } from './file-preferences'
import { resetTabletInteraction, setTabletModifier, tabletModifier, setTabletTemporaryTool, tabletTemporaryTool, setTabletBoxMove, tabletBoxMove } from './tablet-interaction'
import { tabletSelectionHandleHit } from './tablet-selection-hit'
afterEach(resetTabletInteraction)
it('normalizes old and invalid tablet settings without changing desktop layout', () => {
  expect(parseTabletPreferences('{}')).toMatchObject({ touchUi: 'auto', touchBarSide: 'left', gestureUndoEnabled: true, rotationSnapEnabled: true, longPressEyedropper: false })
  expect(parseTabletPreferences('{"touchUi":"broken","touchBarSide":"middle"}')).toMatchObject({ touchUi: 'auto', touchBarSide: 'left' })
  expect(parseTabletPreferences('{"touchUi":"off","touchBarSide":"right","gestureUndoEnabled":false}')).toMatchObject({ touchUi: 'off', touchBarSide: 'right', gestureUndoEnabled: false })
})
it('scopes modifiers to one document and clears held tools on owner change and reset', () => {
  setTabletModifier('a', 'constrain', true); setTabletTemporaryTool('a', 'eyedropper'); setTabletBoxMove('a', true)
  expect(tabletModifier('b', 'constrain')).toBe(false)
  expect(tabletTemporaryTool('a')).toBe('eyedropper')
  setTabletModifier('b', 'center', true)
  expect(tabletTemporaryTool('a')).toBeNull(); expect(tabletBoxMove('a')).toBe(false)
  resetTabletInteraction(); expect(tabletModifier('b', 'center')).toBe(false)
})
it('chooses the closest touch handle and keeps its hit target constant in screen pixels', () => {
  const handles = [{ handle: 'nw' as const, point: { x: 0, y: 0 } }, { handle: 'ne' as const, point: { x: 10, y: 0 } }]
  expect(tabletSelectionHandleHit({ x: 7, y: 1 }, handles, 1)).toBe('ne')
  expect(tabletSelectionHandleHit({ x: -10, y: 0 }, handles, 2)).toBe('nw')
  expect(tabletSelectionHandleHit({ x: -12, y: 0 }, handles, 2)).toBeNull()
})
