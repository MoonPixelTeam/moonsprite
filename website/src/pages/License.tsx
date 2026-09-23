import type { Copy, Language } from '../content'
import { Button } from '../ui'
import { LegalPage } from '../ui/LegalPage'
import { licenseCopy } from './LicenseCopy'

export function LicensePage({ t, language }: { t: Copy; language: Language }) {
  const terms = licenseCopy[language]
  return <LegalPage terms={terms} language={language} backLabel={t.marketPage.license.back} actions={
        <div className="license-actions">
          <Button href="mailto:2310502033@qq.com">{language === 'zh' ? '邮件联系' : 'Contact by email'}</Button>
          <Button href="#/support">{t.supportPage.title}</Button>
          <Button href="#/purchases">{t.accountPage.purchasesTitle}</Button>
        </div>
  } />
}
