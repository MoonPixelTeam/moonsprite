import { EarningsOverview } from '../studio/EarningsOverview'
import { TaskLinks } from '../ui'
import { Input } from '../ui'
import { useMemo, useState } from 'react'
import { Button, Panel, Alert, EmptyState, Field, Select, Metric, StatusBadge } from '../ui'
import { PixelPencil as Pencil, PixelTrash2 as Trash2 } from '../ui/icons'
import type { Copy, Language } from '../content'
import { useStudio } from '../studio/store'
import { useData } from '../data/store'
import { studioToProduct } from '../market/catalogue'
import { formatPrice, productCopy } from '../market/catalog'
import { WorkspacePage } from '../ui'
import { SITE_CONFIG } from '../config'
import { marketPackHash } from '../router'

export function StudioPage({ t, language, section }: { t: Copy; language: Language; section?: string }) {
  const studio = useStudio()
  const s = t.studioPage
  const zh = language === 'zh'
  const title = section === 'products' ? (zh ? '作品管理' : 'Manage products') : section === 'sales' ? s.sales : (zh ? '工作室概览' : 'Studio overview')
  return <WorkspacePage title={title} subtitle={section === 'products' ? (zh ? '管理作品信息、审核状态与交付文件。' : 'Manage listings, review status and downloadable files.') : section === 'sales' ? (zh ? '按订单查看作品销售与收入。' : 'Review sales and earnings by order.') : s.subtitle} eyebrow={s.eyebrow} actions={<Button variant="primary" href="#/studio/publish">{s.publishCta}</Button>}>
    {!SITE_CONFIG.apiBaseUrl && <Alert tone="info">{s.prototypeBody}</Alert>}
    {section === 'products' ? <PublishedPacks t={t} language={language} /> : section === 'sales' ? <SalesTable t={t} language={language} /> : <>
      <EarningsOverview t={t} language={language} />
        <TaskLinks label={language === 'zh' ? '任务入口' : 'Tasks'} items={[
{ href: '#/studio/products', title: zh ? '作品管理' : 'Products', description: zh ? '查看作品、编辑内容与交付文件' : 'Review and edit your listings and files', count: studio.products.length },
{ href: '#/studio/sales', title: s.sales, description: zh ? '查看订单、销量与收入明细' : 'Review orders and earnings', count: studio.sales.length },
{ href: '#/studio/settlement', title: zh ? '收益与结算' : 'Payouts', description: zh ? '查看收入、申请提现与查看进度' : 'Review earnings and withdrawal requests' }
      ]} />
      <div className="workspace-secondary-action"><Button size="compact" onClick={() => studio.setUnlocked(false)}>{s.lock}</Button></div>
    </>}
  </WorkspacePage>
}

function PublishedPacks({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const studio = useStudio()
  const { statusOf, rejectionReason } = useData()
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const products = useMemo(() => studio.products.map((item) => studioToProduct(item, studio.products)), [studio.products])

  const visible = products.filter((product) => productCopy(product.name, language).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === 'all' || statusOf(product.id) === filter))

  return <Panel title={strings.published} actions={<span className="order-count">{products.length}</span>}>
    <div className="workspace-toolbar">
      <Field label={language === 'zh' ? '搜索作品' : 'Search products'}><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
      <Field label={language === 'zh' ? '审核状态' : 'Review status'}><Select label={language === 'zh' ? '审核状态' : 'Review status'} value={filter} onChange={setFilter} options={[
        { value: 'all', label: language === 'zh' ? '全部状态' : 'All statuses' },
        { value: 'pending', label: language === 'zh' ? '审核中' : 'In review' },
        { value: 'approved', label: language === 'zh' ? '已上架' : 'Published' },
        { value: 'rejected', label: language === 'zh' ? '需修改' : 'Changes required' },
      ]} /></Field>
    </div>
    {problem && <Alert tone="danger" role="alert">{problem}</Alert>}
    {visible.length === 0
      ? <EmptyState title={products.length ? (language === 'zh' ? '没有匹配的作品' : 'No matching products') : strings.noPublished} description={products.length ? (language === 'zh' ? '请调整搜索或审核状态。' : 'Try another search or review status.') : undefined} action={products.length ? <Button onClick={() => { setQuery(''); setFilter('all') }}>{language === 'zh' ? '清除筛选' : 'Clear filters'}</Button> : <Button href="#/studio/publish">{strings.publishCta}</Button>} />
      : <ul className="studio-packs">
        {visible.map((product) => <li key={product.id}>
          <span className="studio-pack-art">
            {product.image ? <img src={product.image} alt="" /> : <span className="studio-pack-empty" />}
          </span>
          <span className="studio-pack-copy">
            <strong>{product.name[language]}</strong>
            <small><StatusBadge tone={statusOf(product.id) === 'approved' ? 'success' : statusOf(product.id) === 'rejected' ? 'danger' : 'warning'}>{({ pending: language === 'zh' ? '审核中' : 'In review', approved: language === 'zh' ? '已上架' : 'Approved', rejected: language === 'zh' ? '需修改' : 'Changes required' })[statusOf(product.id)]}</StatusBadge>{rejectionReason(product.id) ? ` · ${rejectionReason(product.id)}` : ''}</small>
            <small>{[productCopy(product.size, language), product.formats.join(' · ')].filter(Boolean).join(' · ') || '—'}</small>
          </span>
          <span className="studio-pack-price">{formatPrice(product.price, language)}</span>
          <div className="workspace-row-actions">
          {/* Editing reopens the publish page with this pack loaded. */}
          <Button size="compact" icon={<Pencil aria-hidden="true" />} href={`#/studio/publish/${product.id}`}>{strings.edit}</Button>
          <Button size="compact" disabled={busy === product.id} icon={<Trash2 aria-hidden="true" />} onClick={() => {
            if (!window.confirm(language === 'zh' ? `确认下架「${product.name.zh}」？` : `Unpublish “${product.name.en}”?`)) return
            setBusy(product.id); setProblem(null)
            void studio.unpublish(product.id).catch(() => setProblem(language === 'zh' ? '下架失败，请重试。' : 'Could not unpublish. Please retry.')).finally(() => setBusy(null))
          }}>{strings.unpublish}</Button>
          </div>
        </li>)}
      </ul>}
  </Panel>
}

function SalesTable({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const studio = useStudio()
  const [query, setQuery] = useState('')
  const sales = studio.sales.filter((line) => `${line.name} ${line.orderId}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return <Panel title={strings.sales} actions={<span className="order-count">{studio.sales.length}</span>}>
    <div className="workspace-toolbar"><Field label={language === 'zh' ? '搜索作品或订单' : 'Search products or orders'}><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></Field></div>
    {sales.length === 0
      ? <EmptyState title={strings.noSales} />
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
          {sales.map((line) => <tr key={`${line.orderId}-${line.productId}`}>
            <td data-label={strings.colDate}>{new Date(line.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</td>
            <td data-label={strings.colPack}><a className="workspace-table-link" href={marketPackHash(line.productId)}>{line.name}</a></td>
            <td data-label={strings.colOrder}><a className="workspace-table-link" href={`#/studio/sales/${line.orderId}`}>{line.orderId}</a></td>
            <td data-label={strings.colQty}>×{line.quantity}</td>
            <td data-label={strings.colGross}>{formatPrice(line.gross, language)}</td>
          </tr>)}
        </tbody>
      </table></div>}
  </Panel>
}

/** Seller-facing order detail assembled from the ledger's sale lines. */
export function StudioSalesOrderPage({ t, language, orderId }: { t: Copy; language: Language; orderId?: string }) {
  const studio = useStudio()
  const zh = language === 'zh'
  const lines = studio.sales.filter((line) => line.orderId === orderId)
  if (!orderId || lines.length === 0) {
    return <WorkspacePage eyebrow={t.studioPage.eyebrow} title={zh ? '找不到销售订单' : 'Sales order not found'} subtitle={zh ? '该订单可能已被移除，或不属于当前工作室。' : 'This order may have been removed or does not belong to this studio.'} back="#/studio/sales" backLabel={zh ? '返回销售记录' : 'Back to sales'}><Panel><EmptyState title={zh ? '没有可显示的销售明细' : 'No sales details available'} action={<Button href="#/studio/sales">{zh ? '返回销售记录' : 'Back to sales'}</Button>} /></Panel></WorkspacePage>
  }
  const gross = lines.reduce((sum, line) => sum + line.gross, 0)
  const fee = lines.reduce((sum, line) => sum + Math.round(line.gross * (line.platformFeePercent ?? studio.platformFeePercent) / 100), 0)
  const units = lines.reduce((sum, line) => sum + line.quantity, 0)
  const createdAt = Math.min(...lines.map((line) => line.createdAt))
  return <WorkspacePage eyebrow={t.studioPage.eyebrow} title={zh ? '销售订单详情' : 'Sales order details'} subtitle={zh ? '查看该订单带来的作品、销量和收入。' : 'Review the products, units and earnings from this order.'} back="#/studio/sales" backLabel={zh ? '返回销售记录' : 'Back to sales'}>
    <Panel title={zh ? '订单摘要' : 'Order summary'}><dl className="workspace-facts sales-order-facts">
      <div><dt>{zh ? '订单编号' : 'Order number'}</dt><dd>{orderId}</dd></div><div><dt>{zh ? '下单日期' : 'Date'}</dt><dd>{new Date(createdAt).toLocaleString(zh ? 'zh-CN' : 'en-US')}</dd></div><div><dt>{zh ? '售出数量' : 'Units sold'}</dt><dd>{units}</dd></div><div><dt>{zh ? '销售总额' : 'Gross sales'}</dt><dd className="price-value">{formatPrice(gross, language)}</dd></div><div><dt>{zh ? '净收入' : 'Net earnings'}</dt><dd className="price-value">{formatPrice(gross - fee, language)}</dd></div>
    </dl></Panel>
    <Panel title={zh ? '销售明细' : 'Sale lines'}><div className="workspace-table-scroll"><table className="studio-table sales-order-table"><thead><tr><th>{zh ? '作品' : 'Product'}</th><th>{zh ? '数量' : 'Qty'}</th><th>{zh ? '收入' : 'Gross'}</th></tr></thead><tbody>{lines.map((line) => <tr key={line.productId}><td data-label={zh ? '作品' : 'Product'}><a className="workspace-table-link" href={marketPackHash(line.productId)}>{line.name}</a></td><td data-label={zh ? '数量' : 'Qty'}>×{line.quantity}</td><td data-label={zh ? '收入' : 'Gross'} className="price-value">{formatPrice(line.gross, language)}</td></tr>)}</tbody></table></div></Panel>
  </WorkspacePage>
}
