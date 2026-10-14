import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')

it('keeps selection ants above guides and guides above the brush preview', () => {
  const zIndex = (className: string) => {
    const rule = styles.match(new RegExp(`\\.${className} \\{[^}]*\\}`))?.[0] ?? ''
    return Number(rule.match(/z-index:\s*(\d+)/)?.[1])
  }
  expect(zIndex('stage-selection-overlay')).toBeGreaterThan(zIndex('stage-guide-overlay'))
  expect(zIndex('stage-guide-overlay')).toBeGreaterThan(zIndex('stage-brush-preview-overlay'))
})
