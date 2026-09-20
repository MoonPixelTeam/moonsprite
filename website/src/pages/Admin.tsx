import { useState } from 'react'
import { Check, Flag, KeyRound, ShieldAlert, X } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData, type ListingStatus, type Report } from '../data/store'
import { Alert, Button, Field, Panel, PageHeader } from '../ui'
import { formatPrice } from '../market/catalog'

const ADMIN_PASSPHRASE = 'admin'

/**
 * The platform console. A market where anyone can publish has to have somebody reviewing:
 * this is where a listing is approved before it reaches the shop, where reports are
 * handled, and where the platform's own cut is visible.
 *
 * Not in the navigation, same as the studio, and gated by a prototype passphrase.
 */
export function AdminPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.adminPage
  const studio = useStudio()
  const { reports, statusOf, setStatus, resolveReport, rejectionReason } = useData()
  const [pass, setPass] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [gateError, setGateError] = useState(false)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  if (!unlocked) {
    return <main id="main" className="market">
      <section className="market-shelf account-head">
        <div className="content-wrap">
          <PageHeader eyebrow="ADMIN" title={strings.title} subtitle={strings.subtitle} back="#/market" backLabel={strings.back} />
        </div>
      </section>
      <section className="market-browse">
        <div className="content-wrap purchases-wrap">
          <Panel title={strings.gateTitle} icon={<KeyRound aria-hidden="true" />}>
            <p className="panel-copy">{strings.gateBody}</p>
            <form className="settings-form" onSubmit={(event) => {
              event.preventDefault()
              if (pass === ADMIN_PASSPHRASE) { setUnlocked(true); setGateError(false); return }
              setGateError(true)
            }}>
              <Field label={strings.gateLabel}>
                <input type="password" value={pass} onChange={(event) => setPass(event.target.value)} />
              </Field>
              {gateError && <Alert tone="danger" role="alert" icon={<ShieldAlert aria-hidden="true" />}>{t.studioPage.gateError}</Alert>}
              <Button type="submit" variant="primary" size="compact">{strings.gateEnter}</Button>
            </form>
            <p className="panel-copy">{strings.gateHint}</p>
          </Panel>
        </div>
      </section>
    </main>
  }

  const statusLabel: Record<ListingStatus, string> = {
    approved: strings.statusApproved,
    pending: strings.statusPending,
    rejected: strings.statusRejected,
  }
  const openReports = reports.filter((report: Report) => report.status === 'open')

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader eyebrow="ADMIN" title={strings.title} subtitle={strings.subtitle} back="#/market" backLabel={strings.back} />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
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

        <Panel title={strings.listings} icon={<Check aria-hidden="true" />}>
          <p className="panel-copy">{strings.listingsHint}</p>
          {studio.products.length === 0
            ? <p className="panel-copy">{strings.noListings}</p>
            : <ul className="admin-list">
              {studio.products.map((product) => {
                const state = statusOf(product.id)
                const why = rejectionReason(product.id)
                return <li key={product.id}>
                  <span className="admin-pack">
                    <strong>{product.name.zh}</strong>
                    <small>{product.formats.join(' · ')} · {formatPrice(product.price)}</small>
                  </span>
                  <span className={`admin-state ${state}`}>{statusLabel[state]}</span>
                  {state === 'rejected' && why && <span className="admin-reason">{why}</span>}
                  <span className="admin-actions">
                    {state !== 'approved' && <Button size="compact" icon={<Check aria-hidden="true" />} onClick={() => { void setStatus(product.id, 'approved') }}>
                      {strings.approve}
                    </Button>}
                    {state !== 'rejected' && <Button size="compact" icon={<X aria-hidden="true" />} onClick={() => setRejecting(product.id)}>
                      {strings.reject}
                    </Button>}
                  </span>
                  {rejecting === product.id && <form className="admin-reject" onSubmit={(event) => {
                    event.preventDefault()
                    void setStatus(product.id, 'rejected', reason)
                    setRejecting(null)
                    setReason('')
                  }}>
                    <Field label={strings.rejectReason}>
                      <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={80} />
                    </Field>
                    <Button type="submit" size="compact">{strings.reject}</Button>
                  </form>}
                </li>
              })}
            </ul>}
        </Panel>

        <Panel title={strings.reports} icon={<Flag aria-hidden="true" />}>
          <p className="panel-copy">{strings.reportsHint}</p>
          {openReports.length === 0
            ? <p className="panel-copy">{strings.noReports}</p>
            : <ul className="report-list">
              {openReports.map((report) => <li key={report.id}>
                <span className="report-pack">{report.productName}</span>
                <span className="report-reason">{t.marketPage.report[`reason${report.reason[0].toUpperCase()}${report.reason.slice(1)}` as 'reasonOther'] ?? report.reason}</span>
                {report.detail && <p>{report.detail}</p>}
                <small>{new Date(report.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</small>
                <Button size="compact" icon={<Check aria-hidden="true" />} onClick={() => { void resolveReport(report.id) }}>
                  {strings.resolveReport}
                </Button>
              </li>)}
            </ul>}
        </Panel>
      </div>
    </section>
  </main>
}
