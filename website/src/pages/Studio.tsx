import { useMemo, useState } from 'react'
import { Button, Panel, Alert } from '../ui'
import { PixelPencil as Pencil, PixelTrash2 as Trash2 } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData } from '../data/store'
import { studioToProduct } from '../market/catalogue'
import { formatPrice, productCopy } from '../market/catalog'
import { WorkspacePage } from '../workspace/WorkspaceLayout'
import { SITE_CONFIG } from '../config'

export function StudioPage({ t, language, section }: { t: Copy; language: Language; section?: string }) {
  const studio = useStudio()
  const s = t.studioPage
  const zh = language === 'zh'
  const title = section === 'products' ? (zh ? '作品管理' : 'Manage products') : section === 'sales' ? s.sales : (zh ? '工作室概览' : 'Studio overview')
  return <WorkspacePage title={title} subtitle={section === 'products' ? (zh ? '管理作品信息、审核状态与交付文件。' : 'Manage listings, review status and downloadable files.') : section === 'sales' ? (zh ? '按订单查看作品销售与收入。' : 'Review sales and earnings by order.') : s.subtitle} eyebrow={s.eyebrow} actions={<Button variant="primary" href="#/studio/publish">{s.publishCta}</Button>}>
    {!SITE_CONFIG.apiBaseUrl && <Alert tone="info">{s.prototypeBody}</Alert>}
    {section === 'products' ? <PublishedPacks t={t} language={language} /> : section === 'sales' ? <SalesTable t={t} language={language} /> : <>
      <div className="studio-metrics">
        <Metric label={s.gross} value={formatPrice(studio.gross)} hint={s.grossHint} />
        <Metric label={s.platformFee} value={formatPrice(studio.platformFee)} hint={s.platformFeeHint(studio.platformFeePercent)} />
        <Metric label={s.net} value={formatPrice(studio.net)} hint={s.netHint} />
        <Metric label={s.available} value={formatPrice(studio.available)} hint={s.availableHint} />
      </div>
      <Panel title={zh ? '管理工作室' : 'Manage your studio'}>
        <div className="workspace-task-list">
          <a href="#/studio/products"><strong>{zh ? '作品管理' : 'Products'}</strong><span>{zh ? '查看作品、编辑内容与交付文件' : 'Review and edit your listings and files'}</span><b>{studio.products.length}</b></a>
          <a href="#/studio/sales"><strong>{s.sales}</strong><span>{zh ? '查看订单、销量与收入明细' : 'Review orders and earnings'}</span><b>{studio.sales.length}</b></a>
          <a href="#/studio/settlement"><strong>{zh ? '收益与结算' : 'Payouts'}</strong><span>{zh ? '管理收款账户、申请提现与查看进度' : 'Manage payout methods and withdrawal requests'}</span></a>
        </div>
      </Panel>
      <div className="workspace-secondary-action"><Button size="compact" onClick={() => studio.setUnlocked(false)}>{s.lock}</Button></div>
    </>}
  </WorkspacePage>
}
function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="studio-metric"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
}

function PublishedPacks({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const studio = useStudio()
  const { statusOf, rejectionReason } = useData()
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const products = useMemo(() => studio.products.map(studioToProduct), [studio.products])

  return <div className="account-panel">
    {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
    <h2>{strings.published}<span className="order-count">{products.length}</span></h2>
    {products.length === 0
      ? <p className="account-empty">{strings.noPublished}</p>
      : <ul className="studio-packs">
        {products.map((product) => <li key={product.id}>
          <span className="studio-pack-art">
            {product.image ? <img src={product.image} alt="" /> : <span className="studio-pack-empty" />}
          </span>
          <span className="studio-pack-copy">
            <strong>{product.name[language]}</strong>
            <small>{({ pending: language === 'zh' ? '审核中' : 'In review', approved: language === 'zh' ? '已上架' : 'Approved', rejected: language === 'zh' ? '需修改' : 'Changes required' })[statusOf(product.id)]}{rejectionReason(product.id) ? ` · ${rejectionReason(product.id)}` : ''}</small>
            <small>{[productCopy(product.size, language), product.formats.join(' · ')].filter(Boolean).join(' · ') || '—'}</small>
          </span>
          <span className="studio-pack-price">{formatPrice(product.price)}</span>
          {/* Editing reopens the publish page with this pack loaded. */}
          <Button size="compact" icon={<Pencil aria-hidden="true" />} href={`#/studio/publish/${product.id}`}>{strings.edit}</Button>
          <Button size="compact" disabled={busy === product.id} icon={<Trash2 aria-hidden="true" />} onClick={() => {
            if (!window.confirm(language === 'zh' ? `确认下架「${product.name.zh}」？` : `Unpublish “${product.name.en}”?`)) return
            setBusy(product.id); setProblem(null)
            void studio.unpublish(product.id).catch(() => setProblem(language === 'zh' ? '下架失败，请重试。' : 'Could not unpublish. Please retry.')).finally(() => setBusy(null))
          }}>{strings.unpublish}</Button>
        </li>)}
      </ul>}
  </div>
}

function SalesTable({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const studio = useStudio()

  return <div className="account-panel">
    <h2>{strings.sales}<span className="order-count">{studio.sales.length}</span></h2>
    {studio.sales.length === 0
      ? <p className="account-empty">{strings.noSales}</p>
      : <div className="workspace-table-scroll"><table className="studio-table">
        <thead>
          <tr>
            <th>{strings.colDate}</th>
            <th>{strings.colPack}</th>
            <th>{strings.colOrder}</th>
            <th>{strings.colQty}</th>
            <th>{strings.colGross}</th>
          </tr>
        </thead>
        <tbody>
          {studio.sales.map((line) => <tr key={`${line.orderId}-${line.productId}`}>
            <td>{new Date(line.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</td>
            <td>{line.name}</td>
            <td>{line.orderId}</td>
            <td>×{line.quantity}</td>
            <td>{formatPrice(line.gross)}</td>
          </tr>)}
        </tbody>
      </table></div>}
  </div>
}
