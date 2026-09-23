import { TaskLinks } from '../ui'
import { Input, Textarea } from '../ui'
import { WorkspacePage } from '../ui'
import { useState } from 'react'
import { PixelCheck as Check, PixelKeyRound as KeyRound, PixelX as X } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData, type ListingStatus, type Report } from '../data/store'
import { Alert, Button, Field, Panel, EmptyState, FilterBar, Metric, RecordSection, StatusBadge } from '../ui'
import { formatPrice } from '../market/catalog'

import { isLocalAdmin, unlockLocalAdmin, clearLocalAdmin } from '../api/permissions'
import { useAccount } from '../account/store'

/**
 * The platform console. A market where anyone can publish has to have somebody reviewing:
 * this is where a listing is approved before it reaches the shop, where reports are
 * handled, and where the platform's own cut is visible.
 *
 * Not in the navigation, same as the studio, and gated by a prototype passphrase.
 */
export function AdminPage({ t, language, section }: { t: Copy; language: Language; section?: string }) {
  const { account } = useAccount()
  const strings = t.adminPage
  const studio = useStudio()
  const { tickets, answerTicket, reports, statusOf, setStatus, resolveReport, rejectionReason } = useData()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [fee, setFee] = useState('')
  const [filter, setFilter] = useState('pending')
  const [problem, setProblem] = useState<string | null>(null)
  const perform = async (action: () => Promise<void>) => {
    if (busy) return false
    setBusy(true); setProblem(null); setNotice(null)
    try { await action(); setNotice(language === 'zh' ? '操作已完成。' : 'Changes saved.'); return true } catch (error) {
      console.warn('MoonSprite admin action failed.', error)
      setProblem(language === 'zh' ? '操作失败，请检查权限、数据状态或存储空间后重试。' : 'Action failed. Check permissions, state and storage before retrying.')
      return false
    } finally { setBusy(false) }
  }
  const [pass, setPass] = useState('')
  const [unlocked, setUnlocked] = useState(() => isLocalAdmin())
  const [gateError, setGateError] = useState(false)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  if (!unlocked || !account || !isLocalAdmin()) {
    return <WorkspacePage eyebrow="ADMIN" title={strings.title} subtitle={strings.subtitle} back="#/market" backLabel={strings.back} >
          <Panel title={strings.gateTitle} icon={<KeyRound aria-hidden="true" />}>
            <p className="panel-copy">{strings.gateBody}</p>
            {!account && <a href="#/account">{language === 'zh' ? '请先登录账号，再进入管理后台' : 'Sign in before opening the console'}</a>}
            <form className="settings-form" onSubmit={(event) => {
              event.preventDefault()
              if (unlockLocalAdmin(pass)) { setUnlocked(true); setGateError(false); return }
              setGateError(true)
            }}>
              <Field label={strings.gateLabel}>
                <Input type="password" value={pass} onChange={(event) => setPass(event.target.value)} />
              </Field>
              {gateError && <Alert tone="danger" role="alert">{t.studioPage.gateError}</Alert>}
              <Button type="submit" variant="primary" size="compact">{strings.gateEnter}</Button>
            </form>
            <p className="panel-copy">{strings.gateHint}</p>
          </Panel>
  </WorkspacePage>
  }

  const statusLabel: Record<ListingStatus, string> = {
    approved: strings.statusApproved,
    pending: strings.statusPending,
    rejected: strings.statusRejected,
  }
  const openReports = reports.filter((report: Report) => report.status === 'open')

  const title = section === 'listings' ? strings.listings : section === 'tickets' ? t.supportPage.tickets : section === 'reports' ? strings.reports : section === 'payouts' ? strings.withdrawals : section === 'settings' ? (language === 'zh' ? '平台设置' : 'Platform settings') : strings.title
  const visibleProducts = studio.products.filter((product) => filter === 'all' || statusOf(product.id) === filter)
  return <WorkspacePage eyebrow="ADMIN" title={title} subtitle={section === 'listings' ? strings.listingsHint : section === 'reports' ? strings.reportsHint : section === 'payouts' ? strings.withdrawalsHint : section === 'tickets' ? (language === 'zh' ? '查看用户问题、关联订单与回复记录。' : 'Review customer questions, related orders and replies.') : section === 'settings' ? (language === 'zh' ? '设置作品销售的平台服务费比例。' : 'Set the service fee applied to product sales.') : strings.subtitle} >
        {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}
        <fieldset className="workspace-form-group" disabled={busy}>
        {!section && <>
        <Panel title={language === 'zh' ? '平台概况' : 'Platform overview'}><div className="studio-metrics">
          <Metric label={strings.revenue} value={formatPrice(studio.platformFee, language)} hint={strings.revenueHint} />
          <Metric label={strings.fee} value={`${studio.platformFeePercent}%`} hint={strings.feeHint(studio.platformFeePercent)} />
          <Metric label={strings.pending} value={studio.products.filter((item) => statusOf(item.id) === 'pending').length} hint={strings.listingsHint} />
        </div></Panel>

        <Panel title={language === 'zh' ? '待处理事项' : 'Work queues'}><TaskLinks label={language === 'zh' ? '任务入口' : 'Tasks'} compact items={[
{ href: '#/admin/listings', title: strings.listings, description: strings.listingsHint, count: studio.products.filter((p) => statusOf(p.id) === 'pending').length },
{ href: '#/admin/tickets', title: t.supportPage.tickets, description: language === 'zh' ? '查看问题并回复用户' : 'Review questions and reply to customers', count: tickets.filter((ticket) => ticket.status === 'open').length },
{ href: '#/admin/reports', title: strings.reports, description: strings.reportsHint, count: openReports.length },
{ href: '#/admin/payouts', title: strings.withdrawals, description: strings.withdrawalsHint, count: studio.withdrawals.filter((item) => item.status === 'requested').length },
{ href: '#/admin/settings', title: language === 'zh' ? '平台设置' : 'Platform settings', description: strings.feeHint(studio.platformFeePercent) }
]} /></Panel>
        </>}
        {section === 'listings' && <Panel title={language === 'zh' ? '审核队列' : 'Review queue'}>
          <FilterBar label={strings.listings} value={filter} onChange={setFilter} options={['pending', 'approved', 'rejected', 'all'].map((value) => ({ value, label: `${value === 'all' ? (language === 'zh' ? '全部' : 'All') : statusLabel[value as ListingStatus]} (${studio.products.filter((product) => value === 'all' || statusOf(product.id) === value).length})` }))} />
          {visibleProducts.length === 0
            ? <EmptyState title={strings.noListings} description={language === 'zh' ? '当前筛选下没有作品，可切换状态查看其他作品。' : 'No listings in this view. Select another status to review other listings.'} />
            : <ul className="admin-list">
              {visibleProducts.map((product) => {
                const state = statusOf(product.id)
                const why = rejectionReason(product.id)
                return <li key={product.id}>
                  <span className="admin-pack">
                    <strong>{product.name[language]}</strong>
                    <small>{product.formats.join(' · ')} · {formatPrice(product.price, language)}</small>
                  </span>
                  <StatusBadge tone={state === 'approved' ? 'success' : state === 'rejected' ? 'danger' : 'warning'}>{statusLabel[state]}</StatusBadge>
                  {state === 'rejected' && why && <span className="admin-reason">{why}</span>}
                  <span className="admin-actions">
                    {state !== 'approved' && <Button size="compact" icon={<Check aria-hidden="true" />} onClick={() => { void perform(() => setStatus(product.id, 'approved')) }}>
                      {strings.approve}
                    </Button>}
                    {state !== 'rejected' && <Button size="compact" icon={<X aria-hidden="true" />} onClick={() => { setRejecting(product.id); setReason('') }}>
                      {strings.reject}
                    </Button>}
                  </span>
                  {rejecting === product.id && <form className="admin-reject" onSubmit={(event) => {
                    event.preventDefault()
                    void perform(() => setStatus(product.id, 'rejected', reason)).then((ok) => { if (ok) { setRejecting(null); setReason('') } })
                  }}>
                    <Field label={strings.rejectReason}>
                      <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={80} required />
                    </Field>
                    <Button type="submit" size="compact">{strings.reject}</Button><Button onClick={() => { setRejecting(null); setReason('') }}>{language === 'zh' ? '取消' : 'Cancel'}</Button>
                  </form>}
                </li>
              })}
            </ul>}
        </Panel>}
        {section === 'tickets' && <Panel title={language === 'zh' ? '订单售后工单' : 'Order support tickets'}>
          {tickets.length === 0 && <EmptyState title={t.supportPage.noTickets} />}
          {tickets.map((ticket) => <RecordSection key={ticket.id} title={ticket.subject} meta={<>{ticket.accountId} · {ticket.orderId ?? ticket.id}</>} status={<StatusBadge tone={ticket.status === 'open' ? 'warning' : 'success'}>{ticket.status === 'open' ? t.supportPage.statusOpen : t.supportPage.statusAnswered}</StatusBadge>}><form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            const reply = new FormData(event.currentTarget).get('reply')
            void perform(() => answerTicket(ticket, String(reply ?? '')))
          }}>
            <p>{ticket.message}</p>
            {ticket.reply && <Alert tone="info" title={language === 'zh' ? '上次回复' : 'Previous reply'}>{ticket.reply}</Alert>}
            <Field label={language === 'zh' ? '回复' : 'Reply'}><Textarea name="reply" required maxLength={1000} /></Field>
            <Button type="submit">{language === 'zh' ? '回复工单' : 'Reply to ticket'}</Button>
          </form></RecordSection>)}
        </Panel>}

        {section === 'reports' && <Panel title={strings.reports}>
          
          {openReports.length === 0
            ? <EmptyState title={strings.noReports} />
            : <ul className="report-list">
              {openReports.map((report) => <li key={report.id}>
                <span className="report-pack">{report.productName}</span>
                <span className="report-reason">{t.marketPage.report[`reason${report.reason[0].toUpperCase()}${report.reason.slice(1)}` as 'reasonOther'] ?? report.reason}</span>
                {report.detail && <p>{report.detail}</p>}
                <small>{new Date(report.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small>
                <Button size="compact" icon={<Check aria-hidden="true" />} onClick={() => { void perform(() => resolveReport(report.id)) }}>
                  {strings.resolveReport}
                </Button>
              </li>)}
            </ul>}
        </Panel>}

        {section === 'payouts' && <Panel title={strings.withdrawals} icon={<Check aria-hidden="true" />}>
          
          {studio.withdrawals.length === 0
            ? <EmptyState title={strings.noWithdrawals} />
            : <ul className="report-list">
              {studio.withdrawals.map((item) => <li key={item.id}>
                <span className="report-pack">{formatPrice(item.amount, language)} · {item.destination}</span>
                <StatusBadge tone={item.status === 'paid' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>{t.marketPage.payoutStatus[item.status]}</StatusBadge>
                <small>{new Date(item.requestedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small>
                <span className="admin-actions">
                  {item.status === 'requested' && <>
                    <Button size="compact" onClick={() => { void perform(() => studio.setWithdrawalStatus(item.id, 'approved')) }}>{strings.approveWithdrawal}</Button>
                    <Button size="compact" onClick={() => { void perform(() => studio.setWithdrawalStatus(item.id, 'rejected')) }}>{strings.rejectWithdrawal}</Button>
                  </>}
                  {item.status === 'approved' && <Button size="compact" onClick={() => { void perform(() => studio.setWithdrawalStatus(item.id, 'paid')) }}>{strings.markPaid}</Button>}
                </span>
              </li>)}
            </ul>}
        </Panel>}
        {section === 'settings' && <Panel title={strings.fee}>
          <p className="panel-copy">{strings.feeHint(studio.platformFeePercent)}</p>
          <form className="settings-form" onSubmit={(event) => { event.preventDefault(); void perform(() => studio.setPlatformFeePercent(Number(fee))) }}>
            <Field label={language === 'zh' ? '平台费率（%）' : 'Platform fee (%)'}><Input type="number" min="0" max="100" step="1" required value={fee} placeholder={String(studio.platformFeePercent)} onChange={(event) => setFee(event.target.value)} /></Field>
            <Button type="submit" variant="primary">{language === 'zh' ? '保存费率' : 'Save fee'}</Button>
          </form>
        </Panel>}
        </fieldset>
        <div className="workspace-secondary-action"><Button size="compact" onClick={() => { clearLocalAdmin(); setUnlocked(false); window.dispatchEvent(new Event('moonsprite:data')) }}>{language === 'zh' ? '退出管理权限' : 'Leave administration'}</Button></div>
  </WorkspacePage>
}
