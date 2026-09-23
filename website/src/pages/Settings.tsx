import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { useState } from 'react'
import { PixelCheck as Check, PixelKeyRound as KeyRound, PixelTrash2 as Trash2 } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { Alert, Button, Field, Panel } from '../ui'

/**
 * Account settings: the things a signed-in person has to be able to change. Before this
 * page the only account action was signing out — a forgotten password meant a lost
 * account, and a typo in the email was permanent.
 */
export function SettingsPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.accountSettings
  const { account, updateName, updateEmail, changePassword, requestPasswordReset, verifyEmail, deleteAccount } = useAccount()

  const [tab, setTab] = useState<'profile' | 'security'>('profile')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(account?.name ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [confirm, setConfirm] = useState('')

  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  if (!account) {
    return <WorkspacePage eyebrow={t.accountPage.eyebrow} title={strings.title} subtitle={strings.forgotBody} back="#/account" backLabel={strings.back} >
          <Panel>
            <div className="receipt-actions">
              <Button variant="primary" href="#/account">{t.accountPage.signIn}</Button>
            </div>
          </Panel>
  </WorkspacePage>
  }

  const run = async (action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, messages: Record<string, string>) => {
    if (busy) return false
    setBusy(true); setNotice(null); setProblem(null)
    try {
      const result = await action()
      if (result.ok) setNotice(success)
      else setProblem(messages[result.error] ?? messages.default)
      return result.ok
    } catch { setProblem(language === 'zh' ? '操作失败，请重试。' : 'Could not save. Please retry.'); return false }
    finally { setBusy(false) }

  }

  return <WorkspacePage eyebrow={t.accountPage.eyebrow} title={strings.title} subtitle={account.email} back="#/account" backLabel={strings.back} >
        {notice && <Alert tone="success" icon={<Check aria-hidden="true" />}>{notice}</Alert>}
        {problem && <Alert tone="danger" role="alert">{problem}</Alert>}

        <div className="workspace-tabs settings-section-nav" role="group" aria-label={strings.title}>
          <Button size="compact" variant={tab === 'profile' ? 'primary' : 'secondary'} onClick={() => { setTab('profile'); setNotice(null); setProblem(null) }}>{strings.profile}</Button>
          <Button size="compact" variant={tab === 'security' ? 'primary' : 'secondary'} onClick={() => { setTab('security'); setNotice(null); setProblem(null) }}>{language === 'zh' ? '安全与隐私' : 'Security & privacy'}</Button>
        </div>
        <fieldset className="workspace-form-group account-settings-view" disabled={busy}>
        {tab === 'profile' && <>

        <Panel title={strings.profile} className="account-settings-profile">
          <div className="account-settings-identity">
            <strong>{account.name}</strong>
            <span>{account.email}</span>
            <em className={account.emailVerified ? 'verified' : 'unverified'}>{account.emailVerified ? strings.emailVerified : strings.emailUnverified}</em>
          </div>
          <div className="settings-grid">
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run(() => updateName(name), strings.changed, { name: strings.errorCurrent, default: strings.errorCurrent })
          }}>
            <Field label={strings.changeName} >
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
            </Field>
            <Button type="submit" size="compact">{strings.changeName}</Button>
          </form>

          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run(() => updateEmail(email), strings.changed, { taken: strings.errorTaken, email: strings.errorTaken, default: strings.errorTaken })
          }}>
            <Field
              label={strings.changeEmail}
              badge={account.emailVerified ? strings.emailVerified : strings.emailUnverified}
              hint={strings.forgotBody}>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <div className="settings-actions">
              <Button type="submit" size="compact">{strings.changeEmail}</Button>
              {!account.emailVerified && <Button size="compact" onClick={() => { void run(async () => { await verifyEmail(); return { ok: true as const } }, strings.verified, { default: strings.errorCurrent }) }}>
                {strings.verifyEmail}
              </Button>}
            </div>
          </form>
          </div>
        </Panel>

        </>}
        {tab === 'security' && <>
        <Panel title={strings.password} icon={<KeyRound aria-hidden="true" />} className="account-settings-security">
          <div className="settings-grid">
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run(() => changePassword({ current, next }), strings.changed, {
              current: strings.errorCurrent,
              same: strings.errorSame,
              default: strings.errorSame,
            }).then((ok) => { if (ok) { setCurrent(''); setNext('') } })
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
            void run(async () => { await requestPasswordReset(resetEmail || account.email); return { ok: true as const } }, strings.resetSent, { default: strings.errorCurrent })
          }}>
            <h3 className="settings-note">{strings.forgotTitle}</h3>
            <p className="panel-copy">{strings.forgotBody}</p>
            <Field label={strings.changeEmail}>
              <input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder={account.email} />
            </Field>
            <Button type="submit" size="compact">{strings.sendReset}</Button>
          </form>
          </div>
        </Panel>


        {/* The destructive action is deliberately outside the two-column grid: it should
            not sit beside ordinary settings as if it were one of them. */}
        <Panel tone="warning" title={strings.danger} className="account-settings-danger">
          <p className="panel-copy">{strings.deleteWarning}</p>
          <div className="settings-actions">
            <Field label={strings.deleteConfirm}>
              <input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE" />
            </Field>
            <Button
              size="compact"
              icon={<Trash2 aria-hidden="true" />}
              disabled={confirm !== 'DELETE'}
              onClick={() => { void run(async () => { await deleteAccount(); return { ok: true as const } }, strings.deleted, { default: strings.errorCurrent }) }}>
              {strings.deleteAccount}
            </Button>
          </div>
        </Panel>
        </>}
        </fieldset>
  </WorkspacePage>
}
