import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { useState } from 'react'
import { PixelCheck as Check, PixelKeyRound as KeyRound, PixelX as X } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData, type ListingStatus, type Report } from '../data/store'
import { Alert, Button, Field, Panel } from '../ui'
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
                <input type="password" value={pass} onChange={(event) => setPass(event.target.value)} />
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
  return <WorkspacePage eyebrow="ADMIN" title={title} subtitle={strings.subtitle} back="#/market" backLabel={strings.back} >
        <div>{problem && <Alert tone="danger" role="alert">{problem}</Alert>}</div>
        {notice && <Alert tone="success">{notice}</Alert>}
        <fieldset className="workspace-form-group" disabled={busy}>
        {!section && <>
        <div className="studio-metrics">
          <div className="studio-metric accent">
            <span>{strings.revenue}</span>
            <strong>{formatPrice(studio.platformFee)}</strong>
            <small>{strings.revenueHint}</small>
          </div>
          <div className="studio-metric">
            <span>{strings.fee}</span>
            <strong>{studio.platformFeePercent}%</strong>
            <small>{strings.feeHint(studio.platformFeePercent)}</small>
          </div>
          <div className="studio-metric">
            <span>{strings.pending}</span>
            <strong>{studio.products.filter((item) => statusOf(item.id) === 'pending').length}</strong>
            <small>{strings.listingsHint}</small>
          </div>
        </div>

        <Panel title={language === 'zh' ? '待处理事项' : 'Work queues'}><div className="workspace-task-list">
          <a href="#/admin/listings"><strong>{strings.listings}</strong><span>{strings.listingsHint}</span><b>{studio.products.filter((p) => statusOf(p.id) === 'pending').length}</b></a>
          <a href="#/admin/tickets"><strong>{t.supportPage.tickets}</strong><span>{language === 'zh' ? '查看问题并回复用户' : 'Review questions and reply to customers'}</span><b>{tickets.filter((ticket) => ticket.status === 'open').length}</b></a>
          <a href="#/admin/reports"><strong>{strings.reports}</strong><span>{strings.reportsHint}</span><b>{openReports.length}</b></a>
          <a href="#/admin/payouts"><strong>{strings.withdrawals}</strong><span>{strings.withdrawalsHint}</span><b>{studio.withdrawals.filter((item) => item.status === 'requested').length}</b></a>
          <a href="#/admin/settings"><strong>{language === 'zh' ? '平台设置' : 'Platform settings'}</strong><span>{strings.feeHint(studio.platformFeePercent)}</span></a>
        </div></Panel>
        </>}
        {section === 'listings' && <Panel title={strings.listings} icon={<Check aria-hidden="true" />}>
          <p className="panel-copy">{strings.listingsHint}</p>
          <div className="workspace-tabs" role="group" aria-label={strings.listings}>{['pending', 'approved', 'rejected', 'all'].map((value) => <Button key={value} size="compact" variant={filter === value ? 'primary' : 'secondary'} onClick={() => setFilter(value)}>{value === 'all' ? (language === 'zh' ? '全部' : 'All') : statusLabel[value as ListingStatus]}</Button>)}</div>
          {visibleProducts.length === 0
            ? <p className="panel-copy">{strings.noListings}</p>
            : <ul className="admin-list">
              {visibleProducts.map((product) => {
                const state = statusOf(product.id)
                const why = rejectionReason(product.id)
                return <li key={product.id}>
                  <span className="admin-pack">
                    <strong>{product.name[language]}</strong>
                    <small>{product.formats.join(' · ')} · {formatPrice(product.price)}</small>
                  </span>
                  <span className={`admin-state ${state}`}>{statusLabel[state]}</span>
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
                      <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={80} required />
                    </Field>
                    <Button type="submit" size="compact">{strings.reject}</Button>
                  </form>}
                </li>
              })}
            </ul>}
        </Panel>}
        {section === 'tickets' && <Panel title={language === 'zh' ? '订单售后工单' : 'Order support tickets'}>
          {tickets.length === 0 && <p>{t.supportPage.noTickets}</p>}
          {tickets.map((ticket) => <form className="settings-form" key={ticket.id} onSubmit={(event) => {
            event.preventDefault()
            const reply = new FormData(event.currentTarget).get('reply')
            void perform(() => answerTicket(ticket, String(reply ?? '')))
          }}>
            <strong>{ticket.subject}</strong>
            <small>{ticket.accountId} · {ticket.orderId ?? ticket.id}</small>
            <p>{ticket.message}</p>
            {ticket.reply && <p>{ticket.reply}</p>}
            <Field label={language === 'zh' ? '回复' : 'Reply'}><textarea name="reply" required maxLength={1000} /></Field>
            <Button type="submit">{language === 'zh' ? '回复工单' : 'Reply to ticket'}</Button>
          </form>)}
        </Panel>}

        {section === 'reports' && <Panel title={strings.reports}>
          <p className="panel-copy">{strings.reportsHint}</p>
          {openReports.length === 0
            ? <p className="panel-copy">{strings.noReports}</p>
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
          <p className="panel-copy">{strings.withdrawalsHint}</p>
          {studio.withdrawals.length === 0
            ? <p className="panel-copy">{strings.noWithdrawals}</p>
            : <ul className="report-list">
              {studio.withdrawals.map((item) => <li key={item.id}>
                <span className="report-pack">{formatPrice(item.amount)} · {item.destination}</span>
                <span className="report-reason">{t.marketPage.payoutStatus[item.status]}</span>
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
            <Field label={language === 'zh' ? '平台费率（%）' : 'Platform fee (%)'}><input type="number" min="0" max="100" step="1" required value={fee} placeholder={String(studio.platformFeePercent)} onChange={(event) => setFee(event.target.value)} /></Field>
            <Button type="submit" variant="primary">{language === 'zh' ? '保存费率' : 'Save fee'}</Button>
          </form>
        </Panel>}
        </fieldset>
        <div className="workspace-secondary-action"><Button size="compact" onClick={() => { clearLocalAdmin(); setUnlocked(false); window.dispatchEvent(new Event('moonsprite:data')) }}>{language === 'zh' ? '退出管理权限' : 'Leave administration'}</Button></div>
  </WorkspacePage>
}
