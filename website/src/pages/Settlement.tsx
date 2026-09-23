import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { useState } from 'react'
import { PixelCheck as Check, PixelTrash2 as Trash2 } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData, maskAccount, type PayoutMethod } from '../data/store'
import { Alert, Button, Field, Panel, Select } from '../ui'
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

  const [amount, setAmount] = useState('')
  const [methodId, setMethodId] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('alipay')
  const [account, setAccount] = useState('')
  const [holder, setHolder] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const defaultMethod = payoutMethods.find((item) => item.isDefault)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem(null)
    setNotice(null)
    try {
    const result = await addPayoutMethod({ kind, account, holder })
    if (!result.ok) {
      setProblem(result.error === 'account' ? strings.errorAccount : result.error === 'holder' ? strings.errorHolder : strings.errorKind)
      return
    }
    setNotice(language === 'zh' ? '收款账户已保存。' : 'Payout method saved.')
    setAccount('')
    setHolder('')
    } catch { setProblem(language === 'zh' ? '保存收款账户失败，请重试。' : 'Could not save payout method. Please retry.') }
    finally { setBusy(false) }
  }


  return <WorkspacePage
          eyebrow={t.studioPage.eyebrow}
          title={strings.title}
          subtitle={strings.subtitle}
          back="#/studio"
          backLabel={t.studioPage.backToStudio} >
        {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
        {notice && <Alert tone="success" icon={<Check aria-hidden="true" />}>{notice}</Alert>}

        <Panel title={strings.title} className="settlement-overview">
          <dl className="account-facts settlement-ledger">
            <div><dt>{strings.cycle}</dt><dd>{strings.cycleValue}</dd></div>
            <div><dt>{strings.nextPayout}</dt><dd>{formatPrice(studio.available)}</dd></div>
            <div><dt>{strings.method}</dt><dd>{defaultMethod ? `${defaultMethod.kind} ${maskAccount(defaultMethod.account)}` : strings.noMethod}</dd></div>
            <div><dt>{t.studioPage.platformFee}</dt><dd>{studio.platformFeePercent}%</dd></div>
          </dl>
          <Alert tone="info">{strings.feeNote(studio.platformFeePercent)}</Alert>
        </Panel>

        <div className="settlement-split">
        <Panel title={t.studioPage.withdraw} className="settlement-withdraw">
          {payoutMethods.length === 0 ? <p className="panel-copy">{strings.noMethod}</p> : <form className="settings-form" onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            const method = payoutMethods.find((item) => item.id === methodId) ?? defaultMethod ?? payoutMethods[0]
            if (!method) return
            setBusy(true); setNotice(null); setProblem(null)
            try {
              const result = await studio.requestWithdrawal(Number(amount), `${method.kind} ${method.account} (${method.holder})`)
              if (!result.ok) setProblem(result.error === 'insufficient' ? t.studioPage.errorInsufficient : t.studioPage.errorAmount)
              else { setNotice(t.studioPage.withdrawRequested); setAmount('') }
            } catch { setProblem(language === 'zh' ? '提现申请失败，请重试。' : 'Withdrawal failed. Please retry.') }
            finally { setBusy(false) }
          }}>
            <Field label={language === 'zh' ? '提现金额（USD）' : 'Withdrawal amount (USD)'} hint={`${t.studioPage.available}: USD ${studio.available.toFixed(2)}`}><input type="number" min="0.01" step="0.01" max={studio.available} value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
            <Field label={strings.method}><Select label={strings.method} value={payoutMethods.find((item) => item.id === methodId)?.id ?? defaultMethod?.id ?? payoutMethods[0]?.id ?? ''} onChange={setMethodId} options={payoutMethods.map((item) => ({ value: item.id, label: `${item.kind} · ${maskAccount(item.account)}` }))} /></Field>
            <Button type="submit" variant="primary" disabled={busy || studio.available <= 0}>{t.studioPage.withdrawSubmit}</Button>
          </form>}
        </Panel>

        <Panel title={strings.payoutHistory} className="settlement-history">
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
        </div>

        <Panel title={strings.addMethod} className="settlement-methods">
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
            <Button type="submit" variant="primary" size="compact" disabled={busy}>{strings.addMethod}</Button>
          </form>

          {payoutMethods.length > 0 && <ul className="method-list">
            {payoutMethods.map((method: PayoutMethod) => <li key={method.id}>
              <span className="method-kind">{method.kind}</span>
              {/* Only ever the masked form: a settings page should not print a full account. */}
              <span className="method-account">{maskAccount(method.account)}</span>
              <span className="method-holder">{method.holder}</span>
              {method.isDefault
                ? <span className="method-default"><Check aria-hidden="true" />{strings.methodDefault}</span>
                : <Button size="compact" onClick={() => { void setDefaultPayoutMethod(method.id).catch(() => setProblem(language === 'zh' ? '设置默认账户失败。' : 'Could not change default method.')) }}>{strings.setDefault}</Button>}
              <Button size="compact" icon={<Trash2 aria-hidden="true" />} onClick={() => { void removePayoutMethod(method.id).catch(() => setProblem(language === 'zh' ? '移除收款账户失败。' : 'Could not remove payout method.')) }}>
                {strings.removeMethod}
              </Button>
            </li>)}
          </ul>}
        </Panel>
  </WorkspacePage>
}
