import { Input } from '../ui'
import { useState, type ReactNode } from 'react'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { Alert, Button, Field, LoadingState, Panel } from '../ui'
import { WorkspacePage } from '../ui'

export function StudioAccess({ t, language, children }: { t: Copy; language: Language; children: ReactNode }) {
  const studio = useStudio()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  if (studio.loading) return <main id="main"><LoadingState label={language === 'zh' ? '正在载入工作室…' : 'Loading your studio…'} /></main>
  if (studio.unlocked) return children
  const s = t.studioPage
  return <WorkspacePage title={s.gateTitle} subtitle={s.gateBody} eyebrow={s.eyebrow}>
    <Panel><form className="settings-form" onSubmit={(event) => { event.preventDefault(); if (password === 'studio') { studio.setUnlocked(true); setError(false) } else setError(true) }}>
      <Field label={s.gateLabel} hint={s.gateHint}><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" required /></Field>
      {error && <Alert tone="danger" role="alert">{s.gateError}</Alert>}
      <Button type="submit" variant="primary">{s.gateEnter}</Button>
    </form></Panel>
  </WorkspacePage>
}
