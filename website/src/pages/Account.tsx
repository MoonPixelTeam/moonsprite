import { useState } from 'react'
import { Button } from '../ui'
import { ArrowLeft, LifeBuoy, LogOut, Settings, ShieldAlert, Store } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { OrderList } from '../account/OrderList'

/**
 * Account page. Signing in, registering, and the order list are all real interactions
 * against the local prototype store — see src/account/store.tsx for what that does and
 * does not guarantee.
 */
export function AccountPage({ t, language }: { t: Copy; language: Language }) {
  const accountStrings = t.accountPage
  const { account, orders, register, signIn, signOut } = useAccount()
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const message = (code: string) => {
    switch (code) {
      case 'name': return accountStrings.errorName
      case 'email': return accountStrings.errorEmail
      case 'password': return accountStrings.errorPassword
      case 'exists': return accountStrings.errorExists
      default: return accountStrings.errorCredentials
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = mode === 'register' ? await register({ name, email, password }) : await signIn({ email, password })
    setBusy(false)
    if (!result.ok) {
      setError(message(result.error))
      return
    }
    setPassword('')
    setName('')
  }

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <nav className="pack-crumbs" aria-label={accountStrings.title}>
          <a href="#/market"><ArrowLeft aria-hidden="true" />{t.marketPage.detail.back}</a>
          <span>{accountStrings.eyebrow}</span>
        </nav>
        <div className="shelf-head">
          <h1>{accountStrings.title}</h1>
          <p>{accountStrings.subtitle}</p>
        </div>
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap account-wrap">
        {account
          ? <div className="account-grid">
            <div className="account-panel">
              <h2>{accountStrings.signedInAs}</h2>
              <dl className="account-facts">
                <div><dt>{accountStrings.nameLabel}</dt><dd>{account.name}</dd></div>
                <div><dt>{accountStrings.emailLabel}</dt><dd>{account.email}</dd></div>
                <div><dt>{accountStrings.memberSince}</dt><dd>{new Date(account.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</dd></div>
              </dl>
              <Button size="compact" onClick={() => { void signOut() }}><LogOut aria-hidden="true" />{accountStrings.signOut}</Button>
              {/* The studio is not in the site navigation on purpose; this is one of the
                  two ways in, the other being the #/studio hash directly. */}
              <div className="account-links">
                <a className="account-studio-link" href="#/studio">
                  <Store aria-hidden="true" />{accountStrings.studioHref}
                </a>
                <a className="account-studio-link" href="#/settings">
                  <Settings aria-hidden="true" />{t.accountSettings.title}
                </a>
                <a className="account-studio-link" href="#/support">
                  <LifeBuoy aria-hidden="true" />{t.supportPage.title}
                </a>
              </div>
            </div>

            <div className="account-panel">
              <h2>{accountStrings.recentOrders}</h2>
              {orders.length === 0
                ? <p className="account-empty">{accountStrings.noOrders}</p>
                : <>
                  <OrderList orders={orders.slice(0, 2)} t={t} language={language} showOrderId={false} />
                  <Button size="compact" href="#/purchases">{accountStrings.viewAll}
                    {orders.length > 2 && <span className="button-count">{orders.length}</span>}</Button>
                </>}
            </div>
          </div>
          : <div className="account-grid">
            <div className="account-panel">
              <div className="account-tabs">
                <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(null) }}>{accountStrings.signIn}</button>
                <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(null) }}>{accountStrings.createAccount}</button>
              </div>
              <form className="account-form" onSubmit={submit}>
                {mode === 'register' && <label>
                  <span>{accountStrings.nameLabel}</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
                </label>}
                <label>
                  <span>{accountStrings.emailLabel}</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                </label>
                <label>
                  <span>{accountStrings.passwordLabel}</span>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} />
                </label>
                {error && <p className="account-error" role="alert">{error}</p>}
                <Button type="submit" variant="primary" disabled={busy}>{busy ? accountStrings.working : mode === 'register' ? accountStrings.createAccount : accountStrings.signIn}</Button>
              </form>
            </div>

            <div className="account-panel account-notice">
              <h2><ShieldAlert aria-hidden="true" />{accountStrings.prototypeTitle}</h2>
              <p>{accountStrings.prototypeBody}</p>
            </div>
          </div>}
      </div>
    </section>
  </main>
}
