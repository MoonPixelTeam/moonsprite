import { LATEST_PACKAGED_RELEASE_LABEL } from './app-meta'
import type { TranslationKey } from './localization'
import { readStoredString, writeStoredString } from './storage'

export const LATEST_RELEASE_SEEN_STORAGE_KEY = 'moonsprite.latest-release-seen'

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
  publishedAt: '2026-09-05',
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

const beta1Release = {
  version: '1.0.0-beta1',
  publishedAt: '2026-08-26',
  homeSummary: 'home.newsReleaseSummaryBeta1',
  sections: [
    {
      title: 'latestRelease.section.interaction',
      items: ['latestRelease.item.selection', 'latestRelease.item.dialogs', 'latestRelease.item.shortcuts']
    },
    {
      title: 'latestRelease.section.canvas',
      items: ['latestRelease.item.mirror', 'latestRelease.item.input']
    },
    {
      title: 'latestRelease.section.preferences',
      items: ['latestRelease.item.preferences', 'latestRelease.item.colors', 'latestRelease.item.cursor']
    },
    {
      title: 'latestRelease.section.maintenance',
      items: ['latestRelease.item.docs', 'latestRelease.item.performance']
    }
  ]
} as const satisfies LatestReleaseDefinition

const dev6Release = {
  version: 'DEV.6',
  publishedAt: '2026-08-23',
  homeSummary: 'home.newsReleaseSummaryDev6',
  sections: [
    {
      title: 'latestRelease.section.interaction',
      items: ['latestRelease.item.tools', 'latestRelease.item.layers', 'latestRelease.item.dragDrop']
    },
    {
      title: 'latestRelease.section.canvas',
      items: ['latestRelease.item.preview', 'latestRelease.item.input']
    },
    {
      title: 'latestRelease.section.preferences',
      items: ['latestRelease.item.colors']
    },
    {
      title: 'latestRelease.section.maintenance',
      items: ['latestRelease.item.format', 'latestRelease.item.performance']
    }
  ]
} as const satisfies LatestReleaseDefinition

/**
 * Complete release feed. Keep every published announcement here so older
 * releases remain available when a new version is published.
 */
export const latestReleases = [currentRelease, beta1Release, dev6Release] as const satisfies readonly LatestReleaseDefinition[]
export const MAX_HOME_ANNOUNCEMENTS = 3
export const homeAnnouncementsForDisplay = (releases: readonly LatestReleaseDefinition[]): readonly LatestReleaseDefinition[] => [...releases]
  .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || right.version.localeCompare(left.version))
  .slice(0, MAX_HOME_ANNOUNCEMENTS)

// Keep the existing single-release API for menus and callers that only need
// the current announcement.
export const latestRelease = latestReleases[0]

/** Returns true once per release version and records that the changelog was shown. */
export const shouldShowLatestRelease = (release: LatestReleaseDefinition = latestRelease, storage?: Storage): boolean => {
  if (readStoredString(LATEST_RELEASE_SEEN_STORAGE_KEY, storage) === release.version) return false
  writeStoredString(LATEST_RELEASE_SEEN_STORAGE_KEY, release.version, storage)
  return true
}
