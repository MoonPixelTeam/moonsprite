import { useState } from 'react'
import { Banknote, Check, CreditCard, Trash2 } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData, maskAccount, type PayoutMethod } from '../data/store'
import { Alert, Button, Field, Panel, PageHeader, Select } from '../ui'
import { formatPrice } from '../market/catalog'

/**
 * Settlement and payouts. The withdrawal panel used to ask for an account number on every
 * request and the status never moved off "requested"; a seller could not tell whether
 * money was coming. This page holds the payout methods and shows where each request is.
 */
export function SettlementPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioSettlement
  const status = t.marketPage.payoutStatus
  const studio = useStudio()
  const { payoutMethods, addPayoutMethod, removePayoutMethod, setDefaultPayoutMethod } = useData()

  const [kind, setKind] = useState('alipay')
  const [account, setAccount] = useState('')
  const [holder, setHolder] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const defaultMethod = payoutMethods.find((item) => item.isDefault)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setProblem(null)
    setNotice(null)
    const result = await addPayoutMethod({ kind, account, holder })
    if (!result.ok) {
      setProblem(result.error === 'account' ? strings.errorAccount : result.error === 'holder' ? strings.errorHolder : strings.errorKind)
      return
    }
    setNotice(t.studioPage.published)
    setAccount('')
    setHolder('')
  }

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader
          eyebrow={t.studioPage.eyebrow}
          title={strings.title}
          subtitle={strings.subtitle}
          icon={<Banknote aria-hidden="true" />}
          back="#/studio"
          backLabel={t.studioPage.backToStudio} />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        {problem && <Alert tone="danger" role="alert" icon={<Banknote aria-hidden="true" />}>{problem}</Alert>}
        {notice && <Alert tone="success" icon={<Check aria-hidden="true" />}>{notice}</Alert>}

        <Panel title={strings.title} icon={<Banknote aria-hidden="true" />}>
          <dl className="account-facts">
            <div><dt>{strings.cycle}</dt><dd>{strings.cycleValue}</dd></div>
            <div><dt>{strings.nextPayout}</dt><dd>{formatPrice(studio.available)}</dd></div>
            <div><dt>{strings.method}</dt><dd>{defaultMethod ? `${defaultMethod.kind} ${maskAccount(defaultMethod.account)}` : strings.noMethod}</dd></div>
            <div><dt>{t.studioPage.platformFee}</dt><dd>{studio.platformFeePercent}%</dd></div>
          </dl>
          <Alert tone="info" icon={<Banknote aria-hidden="true" />}>{strings.feeNote(studio.platformFeePercent)}</Alert>
        </Panel>

        <Panel title={strings.payoutHistory}>
          {studio.withdrawals.length === 0
            ? <p className="panel-copy">{strings.noPayouts}</p>
            : <ul className="payout-list">
              {studio.withdrawals.map((item) => <li key={item.id}>
                <span className="payout-amount">{formatPrice(item.amount)}</span>
                {/* The status is the thing a seller actually wants to know. */}
                <span className={`payout-state ${item.status}`}>{status[item.status]}</span>
                <span className="payout-dest">{item.destination}</span>
                <time>{new Date(item.requestedAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</time>
              </li>)}
            </ul>}
        </Panel>

        <Panel title={strings.addMethod} icon={<CreditCard aria-hidden="true" />}>
          <form className="settings-form" onSubmit={submit}>
            <Field label={strings.methodKind}>
              <Select
                value={kind}
                label={strings.methodKind}
                onChange={setKind}
                options={[
                  { value: 'alipay', label: '支付宝' },
                  { value: 'wechat', label: '微信' },
                  { value: 'bank', label: '银行卡' },
                  { value: 'paypal', label: 'PayPal' },
                ]} />
            </Field>
            <Field label={strings.methodAccount}>
              <input value={account} onChange={(event) => setAccount(event.target.value)} maxLength={64} />
            </Field>
            <Field label={strings.methodHolder}>
              <input value={holder} onChange={(event) => setHolder(event.target.value)} maxLength={40} />
            </Field>
            <Button type="submit" variant="primary" size="compact">{strings.addMethod}</Button>
          </form>

          {payoutMethods.length > 0 && <ul className="method-list">
            {payoutMethods.map((method: PayoutMethod) => <li key={method.id}>
              <span className="method-kind">{method.kind}</span>
              {/* Only ever the masked form: a settings page should not print a full account. */}
              <span className="method-account">{maskAccount(method.account)}</span>
              <span className="method-holder">{method.holder}</span>
              {method.isDefault
                ? <span className="method-default"><Check aria-hidden="true" />{strings.methodDefault}</span>
                : <Button size="compact" onClick={() => { void setDefaultPayoutMethod(method.id) }}>{strings.setDefault}</Button>}
              <Button size="compact" icon={<Trash2 aria-hidden="true" />} onClick={() => { void removePayoutMethod(method.id) }}>
                {strings.removeMethod}
              </Button>
            </li>)}
          </ul>}
        </Panel>
      </div>
    </section>
  </main>
}
