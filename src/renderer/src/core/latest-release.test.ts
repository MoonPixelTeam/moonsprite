import { describe, expect, it } from 'vitest'
import { homeAnnouncementsForDisplay, latestRelease, latestReleases, LATEST_RELEASE_SEEN_STORAGE_KEY, shouldShowLatestRelease, type LatestReleaseDefinition } from './latest-release'

describe('home announcements', () => {
  it('keeps newest-first order and caps the home feed at three items', () => {
    const makeAnnouncement = (version: string): LatestReleaseDefinition => ({
      ...latestRelease,
      version,
      publishedAt: `2026-08-${version === 'newest' ? '30' : version === 'middle' ? '29' : version === 'old' ? '28' : '27'}`
    })
    const announcements = homeAnnouncementsForDisplay([
      makeAnnouncement('old'),
      makeAnnouncement('newest'),
      makeAnnouncement('overflow'),
      makeAnnouncement('middle')
    ])

    expect(announcements).toHaveLength(3)
    expect(announcements.map((item) => item.version)).toEqual(['newest', 'middle', 'old'])
  })

  it('keeps historical release details independent from the current release', () => {
    const announcements = homeAnnouncementsForDisplay(latestReleases)

    expect(announcements.map((item) => item.version)).toEqual(['1.0.0-beta6', '1.0.0-beta5', '1.0.0-beta4'])
    expect(announcements[1].sections).not.toBe(announcements[0].sections)
    expect(announcements[2].sections).not.toBe(announcements[0].sections)
    expect(announcements[1].sections.flatMap((section) => section.items)).not.toEqual(announcements[0].sections.flatMap((section) => section.items))
    expect(announcements[2].sections.flatMap((section) => section.items)).not.toEqual(announcements[0].sections.flatMap((section) => section.items))
  })

  it('shows the changelog once for each release version', () => {
    const storage = new Map<string, string>()
    const testStorage: Storage = {
      get length() { return storage.size },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(key) ?? null,
      key: (index) => [...storage.keys()][index] ?? null,
      removeItem: (key) => { storage.delete(key) },
      setItem: (key, value) => { storage.set(key, value) }
    }

    expect(shouldShowLatestRelease(latestRelease, testStorage)).toBe(true)
    expect(testStorage.getItem(LATEST_RELEASE_SEEN_STORAGE_KEY)).toBe(latestRelease.version)
    expect(shouldShowLatestRelease(latestRelease, testStorage)).toBe(false)
  })
})
