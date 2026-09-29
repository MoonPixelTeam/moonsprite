import { useEffect, useSyncExternalStore } from 'react'
import { getBrowserRecoveryStatus, reportBrowserRecovery, subscribeBrowserRecoveryStatus } from '@/platform/browser-recovery-status'

export function BrowserRecoveryStatus() {
  const status = useSyncExternalStore(subscribeBrowserRecoveryStatus, getBrowserRecoveryStatus)
  useEffect(() => {
    const initial = getBrowserRecoveryStatus()
    let disposed = false
    void window.moonSprite.listRecoveries(365).then(records => {
      if (disposed || initial !== getBrowserRecoveryStatus() || initial.error) return
      const latest = records.map(record => record.updatedAt).sort().at(-1)
      if (latest) reportBrowserRecovery(latest)
    }).catch(() => {
      if (!disposed && initial === getBrowserRecoveryStatus()) reportBrowserRecovery(null, '无法读取浏览器恢复数据，请及时下载工程。')
    })
    return () => { disposed = true }
  }, [])
  return <p className="trial-recovery-status" role={status.error ? 'alert' : 'status'}>
    {status.error ?? (status.updatedAt ? `最近恢复写入：${new Date(status.updatedAt).toLocaleString()}。恢复数据不能代替下载备份。` : '尚无浏览器恢复记录。创作后请主动保存工程。')}
  </p>
}
