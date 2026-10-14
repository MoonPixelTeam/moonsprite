import { DialogHeader } from '@/components/DialogHeader'
import { useI18n } from '@/components/I18nProvider'
import { ModalShell } from '@/components/ModalShell'
import type { LuaScriptRunSummary } from '@/store/lua-script-service'

export type LuaScriptReport =
  | { kind: 'success'; summary: LuaScriptRunSummary }
  | { kind: 'error'; error: string }

interface LuaScriptResultDialogProps {
  report: LuaScriptReport
  onClose: () => void
}

export function LuaScriptResultDialog({ report, onClose }: LuaScriptResultDialogProps) {
  const { t } = useI18n()
  const success = report.kind === 'success'
  const summary = success ? report.summary : null
  return <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="lua-script-result" defaultWidth={500} defaultHeight={360} minWidth={360} minHeight={240} maxWidth={760} maxHeight={680} className="lua-script-result-modal" role={success ? 'dialog' : 'alertdialog'} aria-modal="true" aria-labelledby="lua-script-result-title">
      <DialogHeader eyebrow="LUA SCRIPT" title={t(success ? 'script.resultTitle' : 'script.errorTitle')} titleId="lua-script-result-title" closeLabel={t('common.close')} onClose={onClose} />
      <div className="lua-script-result-body component-scrollbar">
        {summary && <div className="lua-script-result-file">
          <strong>{summary.fileName}</strong>
          {summary.filePath && <small title={summary.filePath}>{summary.filePath}</small>}
          <span>{t('script.summary', { pixels: summary.changedPixelCount, transactions: summary.transactionCount, elapsed: summary.elapsedMs })}</span>
        </div>}
        {summary?.output.length ? <section className="lua-script-output" aria-label={t('script.output')}>
          <h3>{t('script.output')}</h3>
          <pre>{summary.output.join('\n')}</pre>
        </section> : null}
        {report.kind === 'error' && <section className="lua-script-output error" aria-label={t('script.error')}>
          <h3>{t('script.error')}</h3>
          <pre role="alert">{report.error}</pre>
        </section>}
      </div>
      <footer><button type="button" className="primary-button" onClick={onClose}>{t('common.close')}</button></footer>
    </ModalShell>
  </div>
}
