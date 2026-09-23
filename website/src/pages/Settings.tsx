import { useState } from 'react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { Alert, Button, Disclosure, Field, Input, Panel, SettingsRow, StatusBadge, WorkspacePage } from '../ui'

type Setting = 'name' | 'email' | 'password' | 'reset' | 'delete'
type Result = { ok: true } | { ok: false; error: string }

export function SettingsPage({ t, language }: { t: Copy; language: Language }) {
  const s = t.accountSettings
  const zh = language === 'zh'
  const { account, updateName, updateEmail, changePassword, requestPasswordReset, verifyEmail, deleteAccount } = useAccount()
  const [name, setName] = useState(account?.name ?? '')
  const [email, setEmail] = useState(account?.email ?? '')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, setPending] = useState<Setting | null>(null)
  const [feedback, setFeedback] = useState<{ setting: Setting; tone: 'success' | 'danger'; message: string } | null>(null)
  const failure = zh ? '操作失败，请重试。' : 'Could not save. Please retry.'

  const run = async (setting: Setting, action: () => Promise<Result>, success: string, errors: Record<string, string> = {}) => {
    if (pending) return false
    setPending(setting)
    setFeedback(null)
    try {
      const result = await action()
      setFeedback({ setting, tone: result.ok ? 'success' : 'danger', message: result.ok ? success : errors[result.error] ?? failure })
      return result.ok
    } catch {
      setFeedback({ setting, tone: 'danger', message: failure })
      return false
    } finally { setPending(null) }
  }
  const message = (setting: Setting) => feedback?.setting === setting && <Alert tone={feedback.tone} role={feedback.tone === 'danger' ? 'alert' : 'status'}>{feedback.message}</Alert>
  const saving = (setting: Setting, label: string) => pending === setting ? (zh ? '正在处理…' : 'Working…') : label

  if (!account) return <WorkspacePage title={s.title}><Panel><Button variant="primary" href="#/login">{t.accountPage.signIn}</Button></Panel></WorkspacePage>

  return <WorkspacePage title={s.title} subtitle={zh ? '管理个人资料与登录安全。每项修改单独保存。' : 'Manage your profile and sign-in security. Save each change separately.'}>
    <fieldset className="workspace-form-group account-settings-view" disabled={pending !== null} aria-busy={pending !== null}>
      <Panel title={zh ? '个人资料' : 'Profile'}>
        <SettingsRow title={zh ? '用户名' : 'Display name'} description={zh ? '用于显示你的账户名称，修改后不会影响登录。' : 'The name shown on your account. Changing it does not affect sign-in.'}>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run('name', () => updateName(name), zh ? '用户名已保存。' : 'Display name saved.', { name: zh ? '请输入有效的用户名。' : 'Enter a valid display name.' })
          }}>
            <Field label={zh ? '用户名' : 'Display name'}><Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="nickname" maxLength={40} required /></Field>
            <Button type="submit" disabled={!name.trim() || name === account.name}>{saving('name', zh ? '保存用户名' : 'Save name')}</Button>
            {message('name')}
          </form>
        </SettingsRow>
        <SettingsRow title={zh ? '邮箱地址' : 'Email address'} description={zh ? '用于登录、接收账户通知与找回密码。' : 'Used for sign-in, account notifications and password recovery.'}>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run('email', () => updateEmail(email), zh ? '邮箱已保存。' : 'Email saved.', { taken: s.errorTaken, email: zh ? '请输入有效的邮箱地址。' : 'Enter a valid email address.' })
          }}>
            <Field label={zh ? '邮箱地址' : 'Email address'}><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></Field>
            <div className="settings-email-state"><StatusBadge tone={account.emailVerified ? 'success' : 'warning'}>{account.emailVerified ? s.emailVerified : s.emailUnverified}</StatusBadge><span>{zh ? '当前登录邮箱' : 'Current sign-in email'}: {account.email}</span></div>
            <div className="settings-actions">
              <Button type="submit" disabled={email === account.email}>{saving('email', zh ? '保存邮箱' : 'Save email')}</Button>
              {!account.emailVerified && <Button disabled={email !== account.email} onClick={() => { void run('email', async () => { await verifyEmail(); return { ok: true } }, s.verified) }}>{s.verifyEmail}</Button>}
            </div>
            {email !== account.email && <p className="panel-copy">{zh ? '请先保存新邮箱，再进行验证。' : 'Save your new email before verifying it.'}</p>}
            {message('email')}
          </form>
        </SettingsRow>
      </Panel>

      <Panel title={zh ? '登录安全' : 'Sign-in security'}>
        <SettingsRow title={zh ? '修改密码' : 'Change password'} description={zh ? '输入当前密码以确认身份。新密码至少 8 位，且不能与当前密码相同。' : 'Confirm your current password. Use at least 8 characters and choose a different password.'}>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            void run('password', () => changePassword({ current, next }), zh ? '登录密码已更新。' : 'Password updated.', { current: s.errorCurrent, same: s.errorSame }).then((ok) => { if (ok) { setCurrent(''); setNext('') } })
          }}>
            <Field label={s.currentPassword}><Input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required /></Field>
            <Field label={s.newPassword}><Input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={8} required /></Field>
            <Button type="submit" disabled={!current || next.length < 8}>{saving('password', s.changePassword)}</Button>
            {message('password')}
          </form>
          <Disclosure title={s.forgotTitle}>
            <form className="settings-form" onSubmit={(event) => {
              event.preventDefault()
              void run('reset', async () => { await requestPasswordReset(resetEmail || account.email); return { ok: true } }, s.resetSent)
            }}>
              <p className="panel-copy">{zh ? '无法提供当前密码时，可通过注册邮箱申请重置。' : 'If you cannot provide your current password, request a reset using your registered email.'}</p>
              <Field label={zh ? '注册邮箱' : 'Registered email'}><Input type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} placeholder={account.email} autoComplete="email" /></Field>
              <Button type="submit">{saving('reset', s.sendReset)}</Button>
              {message('reset')}
            </form>
          </Disclosure>
        </SettingsRow>
      </Panel>

      <Panel title={zh ? '账户注销' : 'Delete account'} className="workspace-danger">
        <SettingsRow title={zh ? '永久删除账户' : 'Permanently delete account'} description={s.deleteWarning}>
          <form className="settings-form" onSubmit={(event) => {
            event.preventDefault()
            if (confirm !== 'DELETE') return
            void run('delete', async () => { await deleteAccount(); return { ok: true } }, s.deleted)
          }}>
            <Field label={s.deleteConfirm} hint={zh ? '此操作无法撤销，请输入 DELETE 确认。' : 'This cannot be undone. Enter DELETE to confirm.'}><Input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="DELETE" autoComplete="off" spellCheck={false} required /></Field>
            <Button type="submit" disabled={confirm !== 'DELETE'}>{saving('delete', s.deleteAccount)}</Button>
            {message('delete')}
          </form>
        </SettingsRow>
      </Panel>
    </fieldset>
  </WorkspacePage>
}
