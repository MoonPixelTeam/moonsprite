import type { Copy, Language } from '../content'
import { Button } from '../ui'
import { LegalPage } from '../ui/LegalPage'
import { privacyCopy } from './PrivacyCopy'

export function PrivacyPage({ t, language }: { t: Copy; language: Language }) {
  const terms = privacyCopy[language]
  return <LegalPage terms={terms} language={language} backLabel={t.marketPage.license.back} actions={
        <div className="license-actions">
          <Button href="mailto:2310502033@qq.com">{language === 'zh' ? '邮件联系' : 'Contact by email'}</Button>
          <Button href="#/support">{t.supportPage.title}</Button>
          <Button href="#/license">{t.marketPage.license.title}</Button>
        </div>
  } />
}
