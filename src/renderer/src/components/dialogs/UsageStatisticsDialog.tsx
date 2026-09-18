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

const formatTrendScaleHours = (milliseconds: number): string => {
  const hours = milliseconds / 3_600_000
  const rounded = Math.round(hours * 10) / 10
  return `${rounded}时`
}

export function TrendBars({ items, compact = false }: { items: Array<{ key: string; usageMs: number }>; compact?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  const max = Math.max(0, ...items.map((item) => item.usageMs))
  const ceiling = Math.max(3_600_000, Math.ceil(max / (max > 3_600_000 ? 3_600_000 : 60_000)) * (max > 3_600_000 ? 3_600_000 : 60_000))
  const active = items.find((item) => item.key === selected) ?? items.at(-1)
  const dateLabel = (key: string): string => key.slice(5).replace('-', '/')
  const periodLabel = (key: string): string => {
    if (compact) return key
    const end = new Date(`${key}T00:00:00`)
    end.setDate(end.getDate() + 6)
    return `${key} — ${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  }
  return <div className="usage-statistics-trend">
    <div className="usage-statistics-trend-detail"><span>{active ? periodLabel(active.key) : '暂无记录'}</span><strong>{active ? formatDuration(active.usageMs) : '0 秒'}</strong></div>
    <div className="usage-statistics-trend-layout">
      <div className="usage-statistics-trend-scale" aria-hidden="true"><span>{formatTrendScaleHours(ceiling)}</span><span>{formatTrendScaleHours(ceiling / 2)}</span><span>0时</span></div>
      <div className="usage-statistics-trend-plot" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }} onMouseLeave={() => setSelected(null)}>
        {items.map((item) => <button type="button" key={item.key} className={`usage-statistics-trend-item${item.key === active?.key ? ' active' : ''}`}
          aria-label={`${periodLabel(item.key)}，使用时长 ${formatDuration(item.usageMs)}`}
          onMouseEnter={() => setSelected(item.key)} onFocus={() => setSelected(item.key)} onBlur={() => setSelected(null)}>
          <i style={{ height: `${item.usageMs / ceiling * 100}%`, minHeight: item.usageMs > 0 ? 2 : 0 }} />
        </button>)}
        {max === 0 && <span className="usage-statistics-trend-empty">这段时间暂无使用记录</span>}
      </div>
      <div className="usage-statistics-trend-dates" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }} aria-hidden="true">
        {items.map((item, index) => <span key={item.key}>{index === 0 || index === items.length - 1 || (index % (compact ? 7 : 3) === 0 && index < items.length - 2) ? dateLabel(item.key) : ''}</span>)}
      </div>
    </div>
  </div>
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="usage-statistics-card"><span>{label}</span><strong>{value}</strong></div>
}

export function UsageStatisticsDialog({ onClose }: { onClose: () => void }) {
  const setMessage = useWorkspace((state) => state.setMessage)
  const requestDialog = useWorkspace((state) => state.requestDialog)
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
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="usage-statistics" defaultWidth={760} defaultHeight={650} minWidth={560} minHeight={440} maxWidth={900} maxHeight={820} fitContent={false} className="usage-statistics-modal" role="dialog" aria-modal="true" aria-labelledby="usage-statistics-title">
      <DialogHeader title="使用统计" titleId="usage-statistics-title" closeLabel="关闭" onClose={onClose} />
      <div className="modal-body usage-statistics-body">
        <p className="usage-statistics-intro">数据只保存在本机，不记录工程名称、文件路径或创作内容。</p>
        <section className="usage-statistics-section">
          <h3>基础使用信息</h3>
          <div className="usage-statistics-grid">
            <Stat label="实际绘制时长" value={formatDuration(summary.data.drawingTimeMs)} />
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
          <div className="usage-statistics-chart-grid"><div className="usage-statistics-chart"><header><strong>每日趋势 <small>（每日累计使用时长）</small></strong><span>最近 30 天</span></header><TrendBars items={summary.dailyTrend} compact /></div>
          <div className="usage-statistics-chart"><header><strong>每周趋势 <small>（每周累计使用时长 · 周一开始 · 本周尚未结束）</small></strong><span>最近 12 周</span></header><TrendBars items={summary.weeklyTrend} /></div></div>
        </section>
      </div>
      <footer><span className="modal-footer-spacer" /><button type="button" className="quiet-button" disabled={busy} onClick={() => void run(async () => { if (await exportUsageStatistics()) setMessage('使用统计已导出。') })}><PixelUtilityIcon kind="export" />导出 JSON</button><button type="button" className="quiet-button" disabled={busy} onClick={() => void confirmReset()}><PixelUtilityIcon kind="restore" />重置全部统计</button><button type="button" className="primary-button" onClick={onClose}>完成</button></footer>
    </ModalShell>
  </div>
}
