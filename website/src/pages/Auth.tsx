import { useEffect, useState } from 'react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { authHash, navigate, safeReturnTo } from '../router'
import { Alert, Button, Field, LoadingState } from '../ui'
import { SITE_CONFIG } from '../config'

export function AuthPage({ t, language, mode, returnTo }: { t: Copy; language: Language; mode: 'login' | 'register'; returnTo?: string }) {
  const { account, ready, register, signIn } = useAccount()
  const s = t.accountPage
  const registering = mode === 'register'
  const destination = safeReturnTo(returnTo)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (ready && account) navigate(destination) }, [ready, account, destination])
  if (!ready || account) return <main id="main"><LoadingState label={s.working} /></main>
  const errors: Record<string, string> = { name: s.errorName, email: s.errorEmail, password: s.errorPassword, exists: s.errorExists }
  return <main id="main" className="auth-page">
    <section className="auth-card" aria-labelledby="auth-title">
      <a className="auth-brand" href="#/"><img src="/assets/moonsprite-logo.svg" width="32" height="32" alt="" />MoonSprite</a>
      <header><h1 id="auth-title">{registering ? s.createAccount : s.signIn}</h1><p>{language === 'zh' ? '一个账户，管理你的购买与创作。' : 'One account for your purchases and creative work.'}</p></header>
      <form className="settings-form" onSubmit={async (event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true); setError(null)
        try {
          const result = registering ? await register({ name, email, password }) : await signIn({ email, password })
          if (!result.ok) setError(errors[result.error] ?? s.errorCredentials)
        } catch { setError(language === 'zh' ? '暂时无法连接，请重试。' : 'Unable to connect. Please retry.') }
        finally { setBusy(false) }
      }}>
        {registering && <Field label={s.nameLabel}><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={40} required /></Field>}
        <Field label={s.emailLabel}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></Field>
        <Field label={s.passwordLabel}><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} minLength={8} required /></Field>
        <p className="auth-note">{language === 'zh' ? '提交前请阅读' : 'Before submitting, read our '}<a href="#/privacy">{language === 'zh' ? '隐私政策' : 'Privacy Policy'}</a>{language === 'zh' ? '，了解信息用途、保存方式和删除规则。' : ' for information use, storage and deletion details.'}</p>
        {error && <Alert tone="danger" role="alert">{error}</Alert>}
        <Button type="submit" variant="primary" block disabled={busy}>{busy ? s.working : registering ? s.createAccount : s.signIn}</Button>
      </form>
      <p className="auth-switch">{language === 'zh' ? (registering ? '已有账户？' : '还没有账户？') : (registering ? 'Already have an account?' : 'New to MoonSprite?')} <a href={authHash(registering ? 'login' : 'register', destination)}>{registering ? s.signIn : s.createAccount}</a></p>
      {!SITE_CONFIG.apiBaseUrl && <p className="auth-note">{s.prototypeBody}</p>}
      <a className="auth-back" href="#/market">{t.marketPage.detail.back}</a>
    </section>
  </main>
}
