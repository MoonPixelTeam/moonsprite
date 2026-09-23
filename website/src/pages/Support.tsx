import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { useState } from 'react'
import { PixelCheck as Check } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { useData } from '../data/store'
import { SITE_CONFIG } from '../config'
import { Alert, Button, Field, Panel, Select } from '../ui'

/**
 * Support. The two kinds of problem have different answers: a software question belongs
 * in the community where the answer helps everyone, and an order problem needs a ticket
 * tied to the order. The old page offered one link to Discussions for both.
 */
export function SupportPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.supportPage
  const { account, orders } = useAccount()
  const { tickets, openTicket } = useData()

  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [busy, setBusy] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [orderId, setOrderId] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem(null)
    setSent(false)
    try {
    const result = await openTicket({ subject, message, orderId: orderId || undefined })
    if (!result.ok) {
      setProblem(result.error === 'subject' ? strings.errorSubject : strings.errorMessage)
      return
    }
    setSent(true)
    setSubject('')
    setMessage('')
    setOrderId('')
    setTab('history')
    } catch { setProblem(language === 'zh' ? '工单提交失败，请重试。' : 'Could not submit your ticket. Please retry.') }
    finally { setBusy(false) }
  }

  return <WorkspacePage
          eyebrow={t.accountPage.eyebrow}
          title={strings.title}
          subtitle={strings.subtitle}
          
          back="#/account"
          backLabel={strings.back} >
        <div className="workspace-tabs" role="group" aria-label={strings.title}>
          <Button size="compact" variant={tab === 'new' ? 'primary' : 'secondary'} onClick={() => { setTab('new'); setSent(false) }}>{strings.ticket}</Button>
          <Button size="compact" variant={tab === 'history' ? 'primary' : 'secondary'} onClick={() => setTab('history')}>{strings.tickets} ({tickets.length})</Button>
        </div>
        {sent && <Alert tone="success">{strings.ticketSent}</Alert>}
        {tab === 'new' && <>
        <Alert tone="info">{strings.responseNote}</Alert>
        <Panel title={strings.ticket}>
          <p className="panel-copy">{strings.ticketBody}</p>
          <form className="settings-form" onSubmit={submit}>
            <Field label={strings.ticketSubject}>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} />
            </Field>
            <Field label={strings.ticketMessage}>
              <textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} />
            </Field>
            {orders.length > 0 && <Field label={strings.ticketOrder}>
              <Select
                value={orderId}
                label={strings.ticketOrder}
                onChange={setOrderId}
                options={[
                  { value: '', label: '—' },
                  ...orders.map((order) => ({
                    value: order.id,
                    label: `${order.id} · ${new Date(order.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}`,
                  })),
                ]} />
            </Field>}
            {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
            {sent && <Alert tone="success" icon={<Check aria-hidden="true" />}>{strings.ticketSent}</Alert>}
            <Button type="submit" variant="primary" disabled={!account || busy}>{strings.ticketSubmit}</Button>
          </form>
        </Panel>

        <Panel title={strings.software}>
          <p className="panel-copy">{strings.softwareBody}</p>
          <div className="receipt-actions"><Button href={SITE_CONFIG.footerLinks.discussions}>{strings.softwareAction}</Button><Button href="#/faq">{t.nav.faq}</Button></div>
        </Panel>
        </>}
        {tab === 'history' && <Panel title={strings.tickets}>
          {tickets.length === 0
            ? <p className="panel-copy">{strings.noTickets}</p>
            : <ul className="ticket-list">
              {tickets.map((ticket) => <li key={ticket.id}>
                <div className="ticket-head">
                  <strong>{ticket.subject}</strong>
                  <span className={`ticket-state ${ticket.status}`}>
                    {ticket.status === 'open' ? strings.statusOpen : strings.statusAnswered}
                  </span>
                </div>
                <p>{ticket.message}</p>
                {ticket.reply && <p><strong>{language === 'zh' ? '客服回复：' : 'Support reply: '}</strong>{ticket.reply}</p>}
                <small>
                  {new Date(ticket.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                  {ticket.orderId && ` · ${ticket.orderId}`}
                </small>
              </li>)}
            </ul>}
        </Panel>}
  </WorkspacePage>
}
