import { useState } from 'react'
import { Check, LifeBuoy, MessageSquare, Package } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { useData } from '../data/store'
import { SITE_CONFIG } from '../config'
import { Alert, Button, Field, Panel, PageHeader, Select } from '../ui'

/**
 * Support. The two kinds of problem have different answers: a software question belongs
 * in the community where the answer helps everyone, and an order problem needs a ticket
 * tied to the order. The old page offered one link to Discussions for both.
 */
export function SupportPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.supportPage
  const { account, orders } = useAccount()
  const { tickets, openTicket } = useData()

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [orderId, setOrderId] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setProblem(null)
    setSent(false)
    const result = await openTicket({ subject, message, orderId: orderId || undefined })
    if (!result.ok) {
      setProblem(result.error === 'subject' ? strings.errorSubject : strings.errorMessage)
      return
    }
    setSent(true)
    setSubject('')
    setMessage('')
    setOrderId('')
  }

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader
          eyebrow={t.accountPage.eyebrow}
          title={strings.title}
          subtitle={strings.subtitle}
          icon={<LifeBuoy aria-hidden="true" />}
          back="#/account"
          backLabel={strings.back} />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        <Panel title={strings.software} icon={<MessageSquare aria-hidden="true" />}>
          <p className="panel-copy">{strings.softwareBody}</p>
          <div className="receipt-actions">
            <Button href={SITE_CONFIG.footerLinks.discussions}>{strings.softwareAction}</Button>
          </div>
        </Panel>

        <Panel title={strings.order} icon={<Package aria-hidden="true" />}>
          <p className="panel-copy">{strings.orderBody}</p>
          <Alert tone="warning" icon={<Package aria-hidden="true" />}>{strings.responseNote}</Alert>
        </Panel>

        <Panel title={strings.ticket} icon={<LifeBuoy aria-hidden="true" />}>
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
            {problem && <Alert tone="danger" role="alert" icon={<Package aria-hidden="true" />}>{problem}</Alert>}
            {sent && <Alert tone="success" icon={<Check aria-hidden="true" />}>{strings.ticketSent}</Alert>}
            <Button type="submit" variant="primary" disabled={!account}>{strings.ticketSubmit}</Button>
          </form>
        </Panel>

        <Panel title={strings.tickets}>
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
                <small>
                  {new Date(ticket.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                  {ticket.orderId && ` · ${ticket.orderId}`}
                </small>
              </li>)}
            </ul>}
        </Panel>
      </div>
    </section>
  </main>
}
