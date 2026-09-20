import { useState } from 'react'
import { AlertTriangle, Check, KeyRound, Mail, ShieldAlert, Trash2, User } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { Alert, Button, Field, Panel, PageHeader } from '../ui'

/**
 * Account settings: the things a signed-in person has to be able to change. Before this
 * page the only account action was signing out — a forgotten password meant a lost
 * account, and a typo in the email was permanent.
 */
export function SettingsPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.accountSettings
  const { account, updateName, updateEmail, changePassword, requestPasswordReset, verifyEmail, deleteAccount } = useAccount()

  const [name, setName] = useState(account?.name ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [confirm, setConfirm] = useState('')

  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  if (!account) {
    return <main id="main" className="market">
      <section className="market-shelf account-head">
        <div className="content-wrap">
          <PageHeader eyebrow={t.accountPage.eyebrow} title={strings.title} subtitle={strings.forgotBody} back="#/account" backLabel={strings.back} />
        </div>
      </section>
      <section className="market-browse">
        <div className="content-wrap purchases-wrap">
          <Panel>
            <div className="receipt-actions">
              <Button variant="primary" href="#/account">{t.accountPage.signIn}</Button>
            </div>
          </Panel>
        </div>
      </section>
    </main>
  }

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, messages: Record<string, string>) => {
    setNotice(null)
    setProblem(null)
    const result = await action()
    if (result.ok) setNotice(success)
    else setProblem(messages[result.error] ?? messages.default)
  }

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader eyebrow={t.accountPage.eyebrow} title={strings.title} subtitle={account.email} back="#/account" backLabel={strings.back} />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        {notice && <Alert tone="success" icon={<Check aria-hidden="true" />}>{notice}</Alert>}
        {problem && <Alert tone="danger" role="alert" icon={<AlertTriangle aria-hidden="true" />}>{problem}</Alert>}

        <div className="settings-grid">
        <Panel title={strings.profile} icon={<User aria-hidden="true" />}>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run(() => updateName(name), strings.changed, { name: strings.errorCurrent, default: strings.errorCurrent })
          }}>
            <Field label={strings.changeName} badge={strings.emailVerified === '' ? undefined : undefined}>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
            </Field>
            <Button type="submit" size="compact">{strings.changeName}</Button>
          </form>

          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run(() => updateEmail(email), strings.verified, { taken: strings.errorTaken, email: strings.errorTaken, default: strings.errorTaken })
          }}>
            <Field
              label={strings.changeEmail}
              badge={account.emailVerified ? strings.emailVerified : strings.emailUnverified}
              hint={strings.forgotBody}>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <div className="settings-actions">
              <Button type="submit" size="compact">{strings.changeEmail}</Button>
              {!account.emailVerified && <Button size="compact" icon={<Mail aria-hidden="true" />} onClick={() => { void run(async () => { await verifyEmail(); return { ok: true as const } }, strings.verified, { default: strings.errorCurrent }) }}>
                {strings.verifyEmail}
              </Button>}
            </div>
          </form>
        </Panel>

        <Panel title={strings.password} icon={<KeyRound aria-hidden="true" />}>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run(() => changePassword({ current, next }), strings.changed, {
              current: strings.errorCurrent,
              same: strings.errorSame,
              default: strings.errorSame,
            }).then(() => { setCurrent(''); setNext('') })
          }}>
            <Field label={strings.currentPassword}>
              <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
            </Field>
            <Field label={strings.newPassword}>
              <input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={8} />
            </Field>
            <Button type="submit" size="compact">{strings.changePassword}</Button>
          </form>

          {/* Signing out is no longer the end of the road if the password is forgotten. */}
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            setNotice(null)
            setProblem(null)
            void requestPasswordReset(resetEmail || account.email).then(() => setNotice(strings.resetSent))
          }}>
            <h3 className="settings-note">{strings.forgotTitle}</h3>
            <p className="panel-copy">{strings.forgotBody}</p>
            <Field label={strings.changeEmail}>
              <input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder={account.email} />
            </Field>
            <Button type="submit" size="compact">{strings.sendReset}</Button>
          </form>
        </Panel>

        </div>

        {/* The destructive action is deliberately outside the two-column grid: it should
            not sit beside ordinary settings as if it were one of them. */}
        <Panel tone="warning" title={strings.danger} icon={<ShieldAlert aria-hidden="true" />}>
          <p className="panel-copy">{strings.deleteWarning}</p>
          <div className="settings-actions">
            <Field label={strings.deleteConfirm}>
              <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE" />
            </Field>
            <Button
              size="compact"
              icon={<Trash2 aria-hidden="true" />}
              disabled={confirm !== 'DELETE'}
              onClick={() => { void deleteAccount().then(() => setNotice(strings.deleted)) }}>
              {strings.deleteAccount}
            </Button>
          </div>
        </Panel>
      </div>
    </section>
  </main>
}
