import type { ReactNode } from 'react'
import type { Copy, Language } from '../content'
import { Metric, Panel } from '../ui'
import { formatPrice } from '../market/catalog'
import { useStudio } from './store'

/** One earnings panel for the studio overview and withdrawal page. */
export function EarningsOverview({ t, language, actions, className }: {
  t: Copy; language: Language; actions?: ReactNode; className?: string
}) {
  const studio = useStudio()
  const s = t.studioPage
  const orderCount = new Set(studio.sales.map((sale) => sale.orderId)).size
  const unitCount = studio.sales.reduce((sum, sale) => sum + sale.quantity, 0)
  const now = new Date()
  const monthGross = studio.sales
    .filter((sale) => {
      const date = new Date(sale.createdAt)
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    })
    .reduce((sum, sale) => sum + sale.gross, 0)
  const count = (value: number) => value.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
  return <Panel title={language === 'zh' ? '收入概况' : 'Earnings overview'} actions={actions} className={className}>
    <div className="studio-metrics">
      <Metric label={language === 'zh' ? '当月收入' : 'This month'} value={formatPrice(monthGross, language)} hint={language === 'zh' ? '本月产生的销售收入' : 'Sales revenue generated this month'} />
      <Metric label={s.gross} value={formatPrice(studio.gross, language)} hint={s.grossHint} />
      <Metric label={s.net} value={formatPrice(studio.net, language)} hint={s.netHint} />
      <Metric label={s.available} value={formatPrice(studio.available, language)} hint={s.availableHint} />
      <Metric label={language === 'zh' ? '售出数量' : 'Units sold'} value={count(unitCount)} hint={language === 'zh' ? '所有作品的售出件数' : 'Total units sold across packs'} />
      <Metric label={language === 'zh' ? '已发布作品' : 'Published works'} value={count(studio.products.length)} hint={language === 'zh' ? '当前工作室中的作品' : 'Works currently in the studio'} />
      <Metric label={language === 'zh' ? '提现申请' : 'Withdrawal requests'} value={count(studio.withdrawals.length)} hint={language === 'zh' ? '包含处理中和已完成记录' : 'Pending and completed requests'} />
      <Metric label={language === 'zh' ? '销售订单' : 'Sales orders'} value={count(orderCount)} hint={language === 'zh' ? '产生收入的订单数' : 'Orders that generated sales'} />
    </div>
  </Panel>
}
