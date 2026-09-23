import { useEffect } from 'react'
import type { Copy, Language } from '../content'
import type { Route } from '../router'
import { LAZY_PAGE_TITLES } from '../pages/pageTitles'

export function DocumentMeta({ route, language, t }: { route: Route; language: Language; t: Copy }) {
  useEffect(() => {
    const titles: Record<Route['page'], string> = {
      login: `${t.accountPage.signIn} - MoonSprite`, register: `${t.accountPage.createAccount} - MoonSprite`,
      home: t.meta.title,
      competitions: `${language === 'zh' ? '比赛作品展' : 'Competition exhibition'} - MoonSprite`,
      market: `${t.marketPage.title} - MoonSprite`,
      docs: `${LAZY_PAGE_TITLES.docs[language]} - MoonSprite`,
      faq: `${LAZY_PAGE_TITLES.faq[language]} - MoonSprite`,
      blog: `${LAZY_PAGE_TITLES.blog[language]} - MoonSprite`,
      account: `${t.accountPage.title} - MoonSprite`, purchases: `${t.accountPage.purchasesTitle} - MoonSprite`,
      studio: `${t.studioPage.title} - MoonSprite`, 'studio-publish': `${t.studioPage.upload} - MoonSprite`, 'studio-sales-order': `${language === 'zh' ? '销售订单详情' : 'Sales order details'} - MoonSprite`,
      privacy: `${language === 'zh' ? '隐私政策' : 'Privacy Policy'} - MoonSprite`,
      ui: 'UI kit - MoonSprite', license: `${t.marketPage.license.title} - MoonSprite`,
      receipt: `${t.marketPage.receipt.title} - MoonSprite`, orders: `${t.marketPage.orders.title} - MoonSprite`,
      settings: `${t.accountSettings.title} - MoonSprite`, support: `${t.supportPage.title} - MoonSprite`,
      settlement: `${t.studioSettlement.title} - MoonSprite`, admin: `${t.adminPage.title} - MoonSprite`,
    }
    const taskTitles: Record<string, string> = language === 'zh'
      ? { products: '作品管理', sales: '销售记录', listings: '作品审核', tickets: '客服工单', reports: '举报处理', payouts: '提现审核', settings: '平台设置' }
      : { products: 'Manage products', sales: 'Sales', listings: 'Listing review', tickets: 'Support tickets', reports: 'Reports', payouts: 'Withdrawal review', settings: 'Platform settings' }
    document.title = (route.page === 'studio' || route.page === 'admin') && route.subId && taskTitles[route.subId] ? `${taskTitles[route.subId]} - MoonSprite` : titles[route.page]
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', t.meta.title)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', t.meta.description)
  }, [route.page, route.subId, language, t])
  return null
}
