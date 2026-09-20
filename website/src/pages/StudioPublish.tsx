import { ArrowLeft, PackagePlus, Pencil } from 'lucide-react'
import { Button } from '../ui'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { StudioPublish } from './StudioPublishForm'

/**
 * Publishing and editing live on the same page, because they are the same form: with no
 * id it creates a listing, with one it opens that listing for editing. Reached from the
 * dashboard, and only after the studio gate.
 */
export function StudioPublishPage({ t, language, productId }: { t: Copy; language: Language; productId?: string }) {
  const strings = t.studioPage
  const studio = useStudio()
  const editing = productId ? studio.products.find((item) => item.id === productId) ?? null : null
  const title = editing ? `${strings.editPack}：${editing.name.zh}` : strings.upload

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <nav className="pack-crumbs" aria-label={title}>
          <a href="#/studio"><ArrowLeft aria-hidden="true" />{strings.backToStudio}</a>
          <span>{strings.eyebrow}</span>
        </nav>
        <div className="shelf-head">
          <h1>
            {editing ? <Pencil aria-hidden="true" className="shelf-head-icon" /> : <PackagePlus aria-hidden="true" className="shelf-head-icon" />}
            {title}
          </h1>
          <p>{editing ? strings.editSubtitle : strings.uploadSubtitle}</p>
        </div>
      </div>
    </section>
    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        {/* A stale link must say so rather than quietly opening a blank create form. */}
        {productId && !editing
          ? <div className="account-panel">
            <h2>{strings.editMissing}</h2>
            <p className="account-empty">{strings.editMissingBody}</p>
            <Button variant="primary" href="#/studio/publish">{strings.publishCta}</Button>
          </div>
          : <StudioPublish t={t} language={language} editing={editing} />}
      </div>
    </section>
  </main>
}
