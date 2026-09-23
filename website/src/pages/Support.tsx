import { Input, Textarea } from '../ui'
import { WorkspacePage } from '../ui'
import { useState } from 'react'
import { PixelPlus, PixelMinus } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { useData } from '../data/store'
import { SITE_CONFIG } from '../config'
import { FormField, Alert, Button, EmptyState, Field, Panel, Select, StatusBadge } from '../ui'

/**
 * Support. The two kinds of problem have different answers: a software question belongs
 * in the community where the answer helps everyone, and an order problem needs a ticket
 * tied to the order. The old page offered one link to Discussions for both.
 */
export function SupportPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.supportPage
  const { account, orders } = useAccount()
  const { tickets, openTicket } = useData()

  const [tab, setTab] = useState<'new' | 'history'>('history')
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
          backLabel={strings.back}
          actions={<Button variant={tab === 'history' ? 'primary' : 'secondary'} onClick={() => { setTab(tab === 'history' ? 'new' : 'history'); setSent(false) }}>{tab === 'history' ? strings.ticket : strings.tickets}</Button>} >
        {sent && <Alert tone="success">{strings.ticketSent}</Alert>}
        {tab === 'new' && <div className="account-support-layout">
        <div className="account-support-note"><Alert tone="info">{strings.responseNote}</Alert></div>
        <Panel title={strings.ticket} className="workspace-setting-section">
          <p className="panel-copy">{strings.ticketBody}</p>
          <form className="settings-form" onSubmit={submit}>
            <Field label={strings.ticketSubject}>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={80} />
            </Field>
            <Field label={strings.ticketMessage}>
              <Textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} />
            </Field>
            {orders.length > 0 && <FormField label={strings.ticketOrder}>
              <Select
                value={orderId}
                label={strings.ticketOrder}
                onChange={setOrderId}
                options={[
                  { value: '', label: language === 'zh' ? '不关联订单' : 'No related order' },
                  ...orders.map((order) => ({
                    value: order.id,
                    label: `${order.id} · ${new Date(order.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}`,
                  })),
                ]} />
            </FormField>}
            {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
            <Button type="submit" variant="primary" disabled={!account || busy}>{strings.ticketSubmit}</Button>
          </form>
        </Panel>

        <Panel title={strings.software}>
          <p className="panel-copy">{strings.softwareBody}</p>
          <div className="receipt-actions"><Button href={SITE_CONFIG.footerLinks.discussions}>{strings.softwareAction}</Button><Button href="#/faq">{t.nav.faq}</Button></div>
        </Panel>
        </div>}
        {tab === 'history' && <Panel title={strings.tickets} actions={<span className="workspace-count">{tickets.length}</span>}>
          {tickets.length === 0
            ? <EmptyState title={strings.noTickets} action={<Button onClick={() => setTab('new')}>{strings.ticket}</Button>} />
            : <ul className="ticket-list">
              {tickets.map((ticket) => <li key={ticket.id}>
                <details className="account-ticket-detail">
                <summary className="ticket-head">
                  <strong>{ticket.subject}</strong><span className="ticket-expand"><PixelPlus aria-hidden="true" /><PixelMinus aria-hidden="true" /></span>
                  <StatusBadge tone={ticket.status === 'open' ? 'warning' : 'success'}>
                    {ticket.status === 'open' ? strings.statusOpen : strings.statusAnswered}
                  </StatusBadge>
                </summary>
                <p>{ticket.message}</p>
                {ticket.reply && <p><strong>{language === 'zh' ? '客服回复：' : 'Support reply: '}</strong>{ticket.reply}</p>}
                <small>
                  {language === 'zh' ? '提交时间：' : 'Submitted: '}{new Date(ticket.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                  {ticket.orderId && <a href={`#/orders/${ticket.orderId}`}>{language === 'zh' ? '关联订单：' : 'Order: '}{ticket.orderId}</a>}
                </small>
                </details>
              </li>)}
            </ul>}
        </Panel>}
  </WorkspacePage>
}
