import { expect, it } from 'vitest'
import { SHORTCUT_GROUPS } from '@/core/shortcut-contracts'
import { helpArticles } from './help-content'
import { tipsArticles } from './tips-content'

it('keeps all modifier operations after grouping related tips', () => {
  const modifiers = tipsArticles.filter(article => article.category === 'start')
  const covered = modifiers.flatMap(article => article.shortcuts)
  for (const id of SHORTCUT_GROUPS.modifiers) {
    expect(covered.filter(value => value === id)).toHaveLength(1)
  }
})

it('does not repeat help articles or generic command indexes', () => {
  const helpBodies = new Set(helpArticles.map(article => JSON.stringify(article.steps)))
  expect(new Set(tipsArticles.map(article => article.id)).size).toBe(tipsArticles.length)
  for (const article of tipsArticles) {
    expect(helpBodies.has(JSON.stringify(article.steps))).toBe(false)
    expect(article.id.startsWith('commands-')).toBe(false)
    expect(article.title.every(Boolean)).toBe(true)
    expect(article.steps.length).toBeGreaterThan(0)
    expect(article.steps.every(step => step.every(Boolean))).toBe(true)
  }
})
