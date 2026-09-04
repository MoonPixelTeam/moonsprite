import { LATEST_PACKAGED_RELEASE_LABEL } from './app-meta'
import type { TranslationKey } from './localization'

export interface LatestReleaseSection {
  title: TranslationKey
  items: readonly TranslationKey[]
}

export interface LatestReleaseDefinition {
  version: string
  publishedAt: string
  homeSummary: TranslationKey
  sections: readonly LatestReleaseSection[]
}

const currentRelease = {
  version: LATEST_PACKAGED_RELEASE_LABEL,
  publishedAt: '2026-08-26',
  homeSummary: 'home.newsReleaseSummary',
  sections: [
    {
      title: 'latestRelease.section.interaction',
      items: [
        'latestRelease.item.tools',
        'latestRelease.item.selection',
        'latestRelease.item.layers',
        'latestRelease.item.dragDrop',
        'latestRelease.item.shortcuts',
        'latestRelease.item.dialogs'
      ]
    },
    {
      title: 'latestRelease.section.canvas',
      items: [
        'latestRelease.item.rendering',
        'latestRelease.item.preview',
        'latestRelease.item.mirror',
        'latestRelease.item.input'
      ]
    },
    {
      title: 'latestRelease.section.preferences',
      items: [
        'latestRelease.item.preferences',
        'latestRelease.item.colors',
        'latestRelease.item.cursor'
      ]
    },
    {
      title: 'latestRelease.section.maintenance',
      items: [
        'latestRelease.item.format',
        'latestRelease.item.docs',
        'latestRelease.item.performance'
      ]
    }
  ]
} as const satisfies LatestReleaseDefinition

/**
 * Ordered announcement feed. New announcements must be inserted at the
 * beginning; the home page deliberately renders only the first three.
 */
export const latestReleases = [currentRelease] as const satisfies readonly LatestReleaseDefinition[]
export const MAX_HOME_ANNOUNCEMENTS = 3
export const homeAnnouncementsForDisplay = (releases: readonly LatestReleaseDefinition[]): readonly LatestReleaseDefinition[] => releases.slice(0, MAX_HOME_ANNOUNCEMENTS)

// Keep the existing single-release API for menus and callers that only need
// the current announcement.
export const latestRelease = latestReleases[0]
