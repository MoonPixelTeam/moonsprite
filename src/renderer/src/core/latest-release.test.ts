import { describe, expect, it } from 'vitest'
import { homeAnnouncementsForDisplay, latestRelease, type LatestReleaseDefinition } from './latest-release'

describe('home announcements', () => {
  it('keeps newest-first order and caps the home feed at three items', () => {
    const makeAnnouncement = (version: string): LatestReleaseDefinition => ({
      ...latestRelease,
      version,
      publishedAt: `2026-08-${version === 'newest' ? '30' : version === 'middle' ? '29' : version === 'old' ? '28' : '27'}`
    })
    const announcements = homeAnnouncementsForDisplay([
      makeAnnouncement('newest'),
      makeAnnouncement('middle'),
      makeAnnouncement('old'),
      makeAnnouncement('overflow')
    ])

    expect(announcements).toHaveLength(3)
    expect(announcements.map((item) => item.version)).toEqual(['newest', 'middle', 'old'])
  })
})
