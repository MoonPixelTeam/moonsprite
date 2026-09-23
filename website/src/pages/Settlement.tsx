import { EarningsOverview } from '../studio/EarningsOverview'
import { formatPrice, priceIn, USD_TO_CNY } from '../market/catalog'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { prepareWithdrawal } from '../studio/withdrawal'
import { Alert, Button, EmptyState, Field, Input, Panel, StatusBadge, WorkspacePage } from '../ui'
import { SITE_CONFIG } from '../config'

export function SettlementPage({ t, language }: { t: Copy; language: Language }) {
  const studio = useStudio()
  const strings = t.studioSettlement
  const zh = language === 'zh'
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState('')
  const [holder, setHolder] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const money = (value: number) => formatPrice(value, language)
  const step = zh ? USD_TO_CNY : 1
  useEffect(() => { setAmount(''); setProblem(null) }, [language])
  const errors: Record<string, string> = {
    amount: zh ? `请输入大于零且为 ¥${USD_TO_CNY} 整数倍的金额。` : 'Enter a positive whole USD amount.',
    insufficient: t.studioPage.errorInsufficient,
    account: zh ? '请填写有效的支付宝账号（邮箱或手机号）。' : 'Enter an Alipay email or phone number.',
    holder: zh ? '请填写支付宝实名认证姓名（最多 40 字）。' : 'Enter the Alipay verified name (up to 40 characters).',
  }
  const clear = () => { setAmount(''); setAccount(''); setHolder(''); setProblem(null) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    setProblem(null); setNotice(null)
    const request = prepareWithdrawal(amount, account, holder, studio.available, language)
    if (!request.ok) { setProblem(errors[request.error]); return }
    pending.current = true; setBusy(true)
    try {
      const result = await studio.requestWithdrawal(request.amount, request.destination)
      if (!result.ok) { setProblem(errors[result.error] ?? (zh ? '提现申请失败，请重试。' : 'Unable to request withdrawal. Please retry.')); return }
      clear(); setOpen(false); setNotice(t.studioPage.withdrawRequested)
    } catch { setProblem(zh ? '提现申请失败，请重试。' : 'Unable to request withdrawal. Please retry.') }
    finally { pending.current = false; setBusy(false) }
  }
  return <WorkspacePage title={strings.title} subtitle={strings.subtitle} back="#/studio" backLabel={t.studioPage.backToStudio}>
    {notice && <Alert tone="success">{notice}</Alert>}
    {!SITE_CONFIG.apiBaseUrl && <Alert tone="info">{t.studioPage.prototypeBody}</Alert>}
    <EarningsOverview t={t} language={language} className="settlement-overview" actions={<Button variant="primary" disabled={open || studio.loading || studio.available <= 0} onClick={() => { clear(); setNotice(null); setOpen(true) }}>{t.studioPage.withdraw}</Button>} />
    {open && <Panel title={t.studioPage.withdraw} className="settlement-withdraw">
      <p className="panel-copy">{zh ? '通过支付宝收款，请核对账号与实名认证姓名。' : 'Receive funds via Alipay. Check the account and verified name before submitting.'}</p>
      {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
      <form className="settings-form withdrawal-form" onSubmit={submit}>
        <div className="withdrawal-amount">
        <Field label={zh ? '提现金额（人民币）' : 'Withdrawal amount (USD)'}><Input autoFocus name="amount" type="number" min={step} step={step} max={priceIn(studio.available, language)} value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={busy} /></Field>
          <div className="withdrawal-balance"><span>{t.studioPage.available} <strong>{money(studio.available)}</strong></span><Button size="compact" disabled={busy} onClick={() => setAmount(String(priceIn(studio.available, language)))}>{zh ? '全部提现' : 'Withdraw all'}</Button></div>
          <p className="field-hint">{zh ? `演示换算：1 USD = ¥${USD_TO_CNY}，金额需为 ¥${USD_TO_CNY} 的整数倍。` : 'Demo withdrawals use whole USD increments.'}</p>
        </div>
        <div className="withdrawal-recipient">
        <Field label={zh ? '支付宝账号' : 'Alipay account'} hint={zh ? '填写支付宝绑定的邮箱或手机号。' : 'Email or phone linked to Alipay.'}><Input name="alipayAccount" value={account} onChange={(event) => setAccount(event.target.value)} maxLength={64} autoComplete="off" required disabled={busy} /></Field>
        <Field label={zh ? '实名认证姓名' : 'Verified name'} hint={zh ? '须与支付宝实名认证姓名一致。' : 'Must match the verified Alipay account name.'}><Input name="holder" value={holder} onChange={(event) => setHolder(event.target.value)} maxLength={40} autoComplete="off" required disabled={busy} /></Field>
        </div>
        <div className="settlement-submit-actions"><Button type="submit" variant="primary" disabled={busy || studio.available <= 0}>{busy ? (zh ? '提交中…' : 'Submitting…') : t.studioPage.withdrawSubmit}</Button><Button disabled={busy} onClick={() => { clear(); setOpen(false) }}>{zh ? '取消' : 'Cancel'}</Button></div>
      </form>
    </Panel>}
    <Panel title={strings.payoutHistory} className="settlement-history">
      {studio.withdrawals.length === 0 ? <EmptyState title={strings.noPayouts} /> : <ul className="payout-list">
        {[...studio.withdrawals].sort((a, b) => b.requestedAt - a.requestedAt).map((item) => <li key={item.id}>
          <span className="payout-amount">{money(item.amount)}</span>
          <StatusBadge tone={item.status === 'paid' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>{t.marketPage.payoutStatus[item.status]}</StatusBadge>
          <span className="payout-dest">{item.destination}</span>
          <time dateTime={new Date(item.requestedAt).toISOString()}>{new Date(item.requestedAt).toLocaleDateString(zh ? 'zh-CN' : 'en-US')}</time>
          {item.note && <p className="panel-copy">{item.note}</p>}
        </li>)}
      </ul>}
    </Panel>
  </WorkspacePage>
}
