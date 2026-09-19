import type { TranslationKey, TranslationParams } from '@/core/localization'
import { useI18n } from '@/components/I18nProvider'
import { useEffect, useState } from 'react'
import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'
import { PixelUtilityIcon } from '@/components/PixelUtilityIcon'
import { exportUsageStatistics, initializeUsageStatistics, resetUsageStatistics, subscribeUsageStatistics, usageStatisticsSnapshot } from '@/platform/usage-statistics'
import { useWorkspace } from '@/store/workspace'

type Translate = (key: TranslationKey, params?: TranslationParams) => string

const formatDuration = (t: Translate, milliseconds: number): string => {
  const minutes = Math.floor(milliseconds / 60_000)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours > 0) return t('usageStats.hoursMinutes', { hours, minutes: remainingMinutes })
  if (minutes > 0) return t('usageStats.minutes', { count: minutes })
  return t('usageStats.seconds', { count: Math.floor(milliseconds / 1_000) })
}

const formatTrendScaleHours = (t: Translate, milliseconds: number): string => {
  const hours = milliseconds / 3_600_000
  const rounded = Math.round(hours * 10) / 10
  return t('usageStats.hours', { count: rounded })
}

export function TrendBars({ items, compact = false }: { items: Array<{ key: string; usageMs: number }>; compact?: boolean }) {
  const { t } = useI18n()
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
    <div className="usage-statistics-trend-detail"><span>{active ? periodLabel(active.key) : t('usageStats.noRecords')}</span><strong>{active ? formatDuration(t, active.usageMs) : t('usageStats.seconds', { count: 0 })}</strong></div>
    <div className="usage-statistics-trend-layout">
      <div className="usage-statistics-trend-scale" aria-hidden="true"><span>{formatTrendScaleHours(t, ceiling)}</span><span>{formatTrendScaleHours(t, ceiling / 2)}</span><span>{t('usageStats.hours', { count: 0 })}</span></div>
      <div className="usage-statistics-trend-plot" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }} onMouseLeave={() => setSelected(null)}>
        {items.map((item) => <button type="button" key={item.key} className={`usage-statistics-trend-item${item.key === active?.key ? ' active' : ''}`}
          aria-label={t('usageStats.periodUsage', { period: periodLabel(item.key), duration: formatDuration(t, item.usageMs) })}
          onMouseEnter={() => setSelected(item.key)} onFocus={() => setSelected(item.key)} onBlur={() => setSelected(null)}>
          <i style={{ height: `${item.usageMs / ceiling * 100}%`, minHeight: item.usageMs > 0 ? 2 : 0 }} />
        </button>)}
        {max === 0 && <span className="usage-statistics-trend-empty">{t('usageStats.emptyPeriod')}</span>}
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
  const { t } = useI18n()
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
      title: t('usageStats.resetTitle'),
      message: t('usageStats.resetConfirm'),
      detail: t('usageStats.resetDetail'),
      choices: [{ id: 'cancel', label: t('common.cancel'), tone: 'quiet' }, { id: 'reset', label: t('common.reset'), tone: 'primary' }]
    })
    if (choice === 'reset') await run(resetUsageStatistics)
  }
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="usage-statistics" defaultWidth={760} defaultHeight={650} minWidth={560} minHeight={440} maxWidth={900} maxHeight={820} fitContent={false} className="usage-statistics-modal" role="dialog" aria-modal="true" aria-labelledby="usage-statistics-title">
      <DialogHeader title={t('usageStats.title')} titleId="usage-statistics-title" closeLabel={t('componentLibrary.preview.close')} onClose={onClose} />
      <div className="modal-body usage-statistics-body">
        <p className="usage-statistics-intro">{t('usageStats.privacy')}</p>
        <section className="usage-statistics-section">
          <h3>{t('usageStats.basic')}</h3>
          <div className="usage-statistics-grid">
            <Stat label={t('usageStats.drawingTime')} value={formatDuration(t, summary.data.drawingTimeMs)} />
            <Stat label={t('usageStats.totalTime')} value={formatDuration(t, summary.data.totalUsageMs)} />
            <Stat label={t('usageStats.launches')} value={summary.data.launchCount} />
            <Stat label={t('usageStats.streak')} value={t('usageStats.days', { count: summary.consecutiveUsageDays })} />
            <Stat label={t('usageStats.totalDays')} value={t('usageStats.days', { count: summary.totalUsageDays })} />
            <Stat label={t('usageStats.averageSession')} value={formatDuration(t, summary.averageSessionMs)} />
          </div>
        </section>
        <section className="usage-statistics-section">
          <h3>{t('usageStats.creation')}</h3>
          <div className="usage-statistics-grid">
            <Stat label={t('usageStats.newProjects')} value={summary.data.newProjectCount} />
            <Stat label={t('usageStats.saves')} value={summary.data.saveCount} />
            <Stat label={t('usageStats.strokes')} value={summary.data.drawingStrokeCount} />
          </div>
        </section>
        <section className="usage-statistics-section">
          <h3>{t('usageStats.efficiency')}</h3>
          <div className="usage-statistics-grid">
            <Stat label={t('usageStats.longestSession')} value={formatDuration(t, summary.data.longestSessionMs)} />
            <Stat label={t('usageStats.last7Days')} value={formatDuration(t, summary.last7DaysMs)} />
            <Stat label={t('usageStats.last30Days')} value={formatDuration(t, summary.last30DaysMs)} />
          </div>
          <div className="usage-statistics-chart-grid"><div className="usage-statistics-chart"><header><strong>{t('usageStats.dailyTrend')} <small>{t('usageStats.dailyHint')}</small></strong><span>{t('usageStats.last30Days')}</span></header><TrendBars items={summary.dailyTrend} compact /></div>
          <div className="usage-statistics-chart"><header><strong>{t('usageStats.weeklyTrend')} <small>{t('usageStats.weeklyHint')}</small></strong><span>{t('usageStats.last12Weeks')}</span></header><TrendBars items={summary.weeklyTrend} /></div></div>
        </section>
      </div>
      <footer><span className="modal-footer-spacer" /><button type="button" className="quiet-button" disabled={busy} onClick={() => void run(async () => { if (await exportUsageStatistics()) setMessage(t('usageStats.exported')) })}><PixelUtilityIcon kind="export" />{t('usageStats.exportJson')}</button><button type="button" className="quiet-button" disabled={busy} onClick={() => void confirmReset()}><PixelUtilityIcon kind="restore" />{t('usageStats.resetAll')}</button><button type="button" className="primary-button" onClick={onClose}>{t('componentLibrary.done')}</button></footer>
    </ModalShell>
  </div>
}
