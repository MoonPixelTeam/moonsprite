import { useEffect, useState } from 'react'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { exportUsageStatistics, initializeUsageStatistics, resetUsageStatistics, subscribeUsageStatistics, usageStatisticsSnapshot } from '@/platform/usage-statistics'
import { useWorkspace } from '@/store/workspace'

const formatDuration = (milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60_000)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours > 0) return `${hours} 小时 ${remainingMinutes} 分钟`
  if (minutes > 0) return `${minutes} 分钟`
  return `${Math.floor(milliseconds / 1_000)} 秒`
}

function TrendBars({ items, compact = false }: { items: Array<{ key: string; usageMs: number }>; compact?: boolean }) {
  const max = Math.max(1, ...items.map((item) => item.usageMs))
  return <div className={`usage-statistics-trend ${compact ? 'compact' : ''}`}>
    {items.map((item, index) => <span key={item.key} className="usage-statistics-trend-item" title={`${item.key} · ${formatDuration(item.usageMs)}`}>
      <i style={{ height: `${Math.max(item.usageMs > 0 ? 5 : 1, item.usageMs / max * 100)}%` }} />
      {(!compact || index % 2 === 0) && <small>{compact ? item.key.slice(5) : item.key.slice(5)}</small>}
    </span>)}
  </div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="usage-statistics-card"><span>{label}</span><strong>{value}</strong></div>
}

export function UsageStatisticsDialog({ onClose }: { onClose: () => void }) {
  const setMessage = useWorkspace((state) => state.setMessage)
  const requestDialog = useWorkspace((state) => state.requestDialog)
  const actualDrawingTimeMs = useWorkspace((state) => state.sessions.reduce((total, session) => total + (session.document.statistics?.drawingTimeMs ?? 0), 0))
  const [summary, setSummary] = useState(() => usageStatisticsSnapshot())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const refresh = (): void => setSummary(usageStatisticsSnapshot())
    void initializeUsageStatistics().then(refresh)
    const unsubscribe = subscribeUsageStatistics(refresh)
    const timer = window.setInterval(refresh, 1_000)
    return () => { unsubscribe(); window.clearInterval(timer) }
  }, [])
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try { await operation() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const confirmReset = async (): Promise<void> => {
    const choice = await requestDialog({
      title: '重置使用统计',
      message: '确定重置全部使用统计吗？',
      detail: '此操作无法撤销。',
      choices: [{ id: 'cancel', label: '取消', tone: 'quiet' }, { id: 'reset', label: '重置', tone: 'primary' }]
    })
    if (choice === 'reset') await run(resetUsageStatistics)
  }
  return <div className="modal-backdrop latest-release-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="usage-statistics" defaultWidth={760} defaultHeight={650} minWidth={560} minHeight={440} maxWidth={900} maxHeight={820} fitContent={false} className="usage-statistics-modal" role="dialog" aria-modal="true" aria-labelledby="usage-statistics-title">
      <DialogHeader title="使用统计" titleId="usage-statistics-title" closeLabel="关闭" onClose={onClose} />
      <div className="modal-body usage-statistics-body">
        <p className="usage-statistics-intro">数据只保存在本机，不记录工程名称、文件路径或创作内容。</p>
        <section className="usage-statistics-section">
          <h3>基础使用信息</h3>
          <div className="usage-statistics-grid">
            <Stat label="实际绘制时长" value={formatDuration(actualDrawingTimeMs)} />
            <Stat label="累计使用时长" value={formatDuration(summary.data.totalUsageMs)} />
            <Stat label="启动次数" value={summary.data.launchCount} />
            <Stat label="连续使用天数" value={`${summary.consecutiveUsageDays} 天`} />
            <Stat label="总使用天数" value={`${summary.totalUsageDays} 天`} />
            <Stat label="平均每次使用时长" value={formatDuration(summary.averageSessionMs)} />
          </div>
        </section>
        <section className="usage-statistics-section">
          <h3>创作统计</h3>
          <div className="usage-statistics-grid">
            <Stat label="新建工程次数" value={summary.data.newProjectCount} />
            <Stat label="保存次数" value={summary.data.saveCount} />
            <Stat label="累计绘制笔画数" value={summary.data.drawingStrokeCount} />
          </div>
        </section>
        <section className="usage-statistics-section">
          <h3>效率信息</h3>
          <div className="usage-statistics-grid">
            <Stat label="单次最长使用时间" value={formatDuration(summary.data.longestSessionMs)} />
            <Stat label="最近 7 天" value={formatDuration(summary.last7DaysMs)} />
            <Stat label="最近 30 天" value={formatDuration(summary.last30DaysMs)} />
          </div>
          <div className="usage-statistics-chart-grid"><div className="usage-statistics-chart"><header><strong>每日趋势</strong><span>最近 30 天</span></header><TrendBars items={summary.dailyTrend} compact /></div>
          <div className="usage-statistics-chart"><header><strong>每周趋势</strong><span>最近 12 周</span></header><TrendBars items={summary.weeklyTrend} /></div></div>
        </section>
      </div>
      <footer><span className="modal-footer-spacer" /><button type="button" className="quiet-button" disabled={busy} onClick={() => void run(async () => { if (await exportUsageStatistics()) setMessage('使用统计已导出。') })}><PixelUtilityIcon kind="export" />导出 JSON</button><button type="button" className="quiet-button" disabled={busy} onClick={() => void confirmReset()}><PixelUtilityIcon kind="restore" />重置全部统计</button><button type="button" className="primary-button" onClick={onClose}>完成</button></footer>
    </ModalShell>
  </div>
}
