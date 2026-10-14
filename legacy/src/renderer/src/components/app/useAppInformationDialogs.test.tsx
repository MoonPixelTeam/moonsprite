import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { shouldShowLatestRelease } from '@/core/latest-release'
import { useAppInformationDialogs } from './useAppInformationDialogs'

vi.mock('@/store/workspace', () => ({ useWorkspace: { getState: () => ({ setMessage: vi.fn() }) } }))
vi.mock('@/core/latest-release', () => ({ latestRelease: { version: 'test' }, shouldShowLatestRelease: vi.fn(() => true) }))
vi.mock('@/components/LatestReleaseDialog', () => ({ LatestReleaseDialog: () => <div>Desktop changelog</div> }))
vi.mock('@/components/TrialAnnouncementDialog', () => ({ TrialAnnouncementDialog: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Trial notice</button> }))
vi.mock('@/components/dialogs/UsageStatisticsDialog', () => ({ UsageStatisticsDialog: () => null }))

function Harness() {
  const dialogs = useAppInformationDialogs()
  return <>{dialogs.appInformationDialogsSurface}<button onClick={() => dialogs.openLatestRelease()}>Reopen notice</button></>
}

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.clearAllMocks() })

it('shows the trial announcement on every entry without reading or writing release-seen state', () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'web-trial')
  const first = render(<Harness />)
  fireEvent.click(first.getByText('Trial notice'))
  expect(first.queryByText('Trial notice')).toBeNull()
  fireEvent.click(first.getByText('Reopen notice'))
  expect(first.getByText('Trial notice')).toBeTruthy()
  first.unmount()
  const next = render(<Harness />)
  expect(next.getByText('Trial notice')).toBeTruthy()
  expect(next.queryByText('Desktop changelog')).toBeNull()
  expect(shouldShowLatestRelease).not.toHaveBeenCalled()
})

it('preserves the desktop release announcement policy', () => {
  vi.stubEnv('VITE_MOONSPRITE_TARGET', 'windows-full')
  const view = render(<Harness />)
  expect(view.getByText('Desktop changelog')).toBeTruthy()
  expect(view.queryByText('Trial notice')).toBeNull()
  expect(shouldShowLatestRelease).toHaveBeenCalledOnce()
})
