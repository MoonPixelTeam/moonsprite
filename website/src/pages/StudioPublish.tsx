import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { Button, EmptyState } from '../ui'
import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { navigate } from '../router'
import { StudioPublish } from './StudioPublishForm'

export function StudioPublishPage({ t, language, productId }: { t: Copy; language: Language; productId?: string }) {
  const s = t.studioPage
  const studio = useStudio()
  const editing = productId ? studio.products.find((item) => item.id === productId) ?? null : null
  return <WorkspacePage title={editing ? `${s.editPack}：${editing.name[language]}` : s.upload} subtitle={editing ? s.editSubtitle : s.uploadSubtitle} back="#/studio/products" backLabel={language === 'zh' ? '作品管理' : 'Manage products'}>
    {productId && !editing ? <EmptyState title={s.editMissing} description={s.editMissingBody} action={<Button href="#/studio/products">{s.backToStudio}</Button>} /> : <StudioPublish key={productId ?? 'new'} t={t} language={language} editing={editing} onDone={() => navigate('#/studio/products')} />}
  </WorkspacePage>
}
