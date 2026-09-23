import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import { createElement as h, act } from 'react'
import { createRoot } from 'react-dom/client'

test('workspace deep links preserve page ownership, access gates and admin navigation', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  for (const key of ['window', 'document', 'localStorage', 'Event', 'HTMLElement', 'HTMLInputElement', 'MutationObserver']) globalThis[key] = key === 'localStorage' ? dom.window.localStorage : dom.window[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  const root = createRoot(document.getElementById('root'))
  try {
    const { parseHash, useRoute, safeReturnTo } = await server.ssrLoadModule('/src/router.ts')
    const { AuthPage } = await server.ssrLoadModule('/src/pages/Auth.tsx')
    const { PrivacyPage } = await server.ssrLoadModule('/src/pages/Privacy.tsx')
    const { LicensePage } = await server.ssrLoadModule('/src/pages/License.tsx')
    const { copy } = await server.ssrLoadModule('/src/content.ts')
    const { WorkspaceRoutes } = await server.ssrLoadModule('/src/workspace/WorkspaceRoutes.tsx')
    const { AccountProvider } = await server.ssrLoadModule('/src/account/store.tsx')
    const { StudioProvider, useStudio } = await server.ssrLoadModule('/src/studio/store.tsx')
    const { DataProvider } = await server.ssrLoadModule('/src/data/store.tsx')
    const { CatalogueProvider } = await server.ssrLoadModule('/src/market/catalogue.ts')
    const { localAdapter, writeStudioUnlocked } = await server.ssrLoadModule('/src/api/local.ts')
    const { unlockLocalAdmin } = await server.ssrLoadModule('/src/api/permissions.ts')
    let unlockStudio
    function Routed({ language }) {
      const studio = useStudio()
      unlockStudio = () => studio.setUnlocked(true)
      const route = useRoute()
      if (route.page === 'privacy') return h(PrivacyPage, { t: copy[language], language })
      if (route.page === 'license') return h(LicensePage, { t: copy[language], language })
      return route.page === 'login' || route.page === 'register'
        ? h(AuthPage, { key: route.page, mode: route.page, returnTo: route.returnTo, t: copy[language], language })
        : h(WorkspaceRoutes, { route, t: copy[language], language })
    }
    const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)) }) }
    const render = async (hash, language = 'zh') => {
      await act(async () => {
        window.location.hash = hash
        root.render(h(AccountProvider, null, h(StudioProvider, null, h(DataProvider, null, h(CatalogueProvider, null, h(Routed, { language }))))))
      })
      await flush()
      await flush()
    }
    await render('#/studio/publish')
    assert.equal(document.querySelectorAll('main').length, 1)
    assert.equal(document.querySelector('.workspace-shell'), null)
    assert.ok(document.querySelector('input[autocomplete="email"]'))
    assert.ok(document.querySelector('a[href="#/privacy"]'), 'privacy notice is available before registration')
    assert.equal(parseHash(window.location.hash).page, 'login')
    assert.equal(parseHash(window.location.hash).returnTo, '#/studio/publish')
    assert.equal(safeReturnTo('//example.com'), '#/account')
    await act(async () => { document.querySelector('.auth-switch a').click() })
    await flush()
    assert.equal(parseHash(window.location.hash).page, 'register')
    assert.equal(parseHash(window.location.hash).returnTo, '#/studio/publish')
    assert.ok(document.querySelector('input[autocomplete="name"]'))
    await act(async () => {
      await localAdapter.auth.register({ name: 'Creator', email: 'creator@example.com', password: 'password123' })
      window.dispatchEvent(new Event('storage'))
    })
    await flush()
    await flush()
    assert.equal(window.location.hash, '#/studio/publish')
    assert.ok(document.body.textContent.includes(copy.zh.studioPage.gateTitle), 'studio gate still required')
    await act(async () => {
      const account = await localAdapter.auth.current()
      writeStudioUnlocked(true, account.id)
      window.dispatchEvent(new Event('storage'))
    })
    for (const hash of ['#/studio', '#/studio/products', '#/studio/sales', '#/studio/settlement', '#/studio/publish', '#/settings', '#/support', '#/purchases']) {
      await render(hash)
      assert.equal(document.querySelectorAll('main').length, 1, hash)
      assert.equal(document.querySelectorAll('h1').length, 1, hash)
      assert.equal(document.querySelectorAll('.workspace-nav a[aria-current="page"]').length, 1, hash)
    }
    await act(async () => { unlockStudio() })
    // Both pages render the same four earnings metrics in the selected currency.
    for (const language of ['zh', 'en']) {
      await render('#/studio', language)
      const overview = document.querySelector('.studio-metrics').textContent
      assert.equal(document.querySelectorAll('.studio-metric').length, 8)
      assert.ok(overview.includes(language === 'zh' ? '¥' : '$'))
      await render('#/studio/settlement', language)
      assert.equal(document.querySelector('.studio-metrics').textContent, overview)
    }
    // The redesigned task views keep unrelated forms out of the active workflow.
    await render('#/studio/settlement')
    assert.ok(document.querySelector('.settlement-overview'))
    assert.ok(document.querySelector('.settlement-history'))
    assert.equal(document.querySelector('.settlement-withdraw'), null)
    assert.equal(document.querySelector('.settlement-overview button').disabled, true, 'no balance cannot be withdrawn')
    assert.equal(document.querySelector('.workspace-tabs'), null, 'no saved-method management tabs')
    await render('#/settings')
    assert.ok(document.querySelector('input[autocomplete="current-password"]'))
    assert.ok(document.querySelector('.workspace-danger button:disabled'))
    await render('#/support')
    assert.equal(document.querySelector('textarea'), null)
    await act(async () => { document.querySelector('.page-head-actions button').click() })
    assert.ok(document.querySelector('textarea'))
    await act(async () => { document.querySelector('.page-head-actions button').click() })
    assert.equal(document.querySelector('textarea'), null)
    await render('#/studio/publish')
    assert.equal(document.querySelectorAll('.studio-fieldset').length, 5)
    assert.equal(document.querySelector('.panel .panel'), null, 'publishing groups are siblings, not nested panels')
    await render('#/account')
    const sidebar = document.querySelector('.workspace-sidebar')
    const contentPane = document.querySelector('.workspace-content')
    for (const hash of ['#/settings', '#/support', '#/purchases', '#/studio', '#/studio/products', '#/studio/sales', '#/studio/settlement', '#/account']) {
      await act(async () => { document.querySelector(`.workspace-nav a[href="${hash}"]`).click() })
      await flush()
      assert.equal(window.location.hash, hash)
      assert.equal(document.querySelector('.workspace-sidebar'), sidebar, 'sidebar remains mounted')
      assert.equal(document.querySelector('.workspace-content'), contentPane, 'content layout remains mounted')
    }
    await render('#/admin/listings')
    assert.ok(document.body.textContent.includes(copy.zh.adminPage.gateTitle))
    await act(async () => { assert.equal(unlockLocalAdmin('admin'), true) })
    // Remount page to emulate an admin deep-link visit after unlocking.
    await render('#/account')
    await render('#/admin', 'en')
    assert.equal(document.querySelectorAll('.workspace-task-list a').length, 5, 'overview exposes all five management tasks')
    for (const sub of ['/listings', '/tickets', '/reports', '/payouts', '/settings']) {
      await act(async () => { document.querySelector(`.workspace-nav a[href="#/admin${sub}"]`).click() })
      await flush()
      assert.equal(window.location.hash, `#/admin${sub}`)
      assert.equal(document.querySelectorAll('h1').length, 1)
      assert.equal(document.querySelector('.workspace-nav a[aria-current="page"]')?.getAttribute('href'), `#/admin${sub}`)
      assert.ok(!document.body.textContent.includes(copy.en.adminPage.gateHint))
      assert.ok(document.querySelector('.workspace-body .panel'))
    }
    await render('#/market')
    assert.equal(document.querySelector('.workspace-shell'), null, 'public market stays outside workspace')
    await act(async () => { await localAdapter.auth.signOut(); window.dispatchEvent(new Event('storage')) })
    await render('#/license')
    assert.equal(document.querySelector('.workspace-shell'), null)
    const { licenseCopy } = await server.ssrLoadModule('/src/pages/LicenseCopy.ts')
    for (const language of ['zh', 'en']) {
      await render('#/license', language)
      const terms = licenseCopy[language]
      assert.equal(document.querySelectorAll('.license-section').length, terms.sections.length)
      assert.ok(document.body.textContent.includes(terms.notice), 'draft status is disclosed in both languages')
      assert.ok(document.querySelector('a[href="mailto:2310502033@qq.com"]'), 'support remains accessible while signed out')
      for (const section of terms.sections) {
        const rendered = document.getElementById(section.id)
        assert.ok(rendered, 'each outline destination exists')
        for (const paragraph of section.paragraphs) assert.ok(rendered.textContent.includes(paragraph), 'all legal clauses render without truncation')
      }
      for (const text of [...copy[language].marketPage.license.grants, ...copy[language].marketPage.license.limits, ...copy[language].marketPage.license.refunds]) assert.ok(document.body.textContent.includes(text), 'shared terms and full agreement remain consistent')
    }

    const { privacyCopy } = await server.ssrLoadModule('/src/pages/PrivacyCopy.ts')
    const { SITE_CONFIG } = await server.ssrLoadModule('/src/config.ts')
    assert.equal(SITE_CONFIG.footerLinks.privacy, '#/privacy')
    assert.equal(parseHash('#/privacy').page, 'privacy')
    for (const language of ['zh', 'en']) {
      await render('#/privacy', language)
      const policy = privacyCopy[language]
      assert.equal(document.querySelector('.workspace-shell'), null)
      assert.equal(document.querySelectorAll('main').length, 1)
      assert.equal(document.querySelectorAll('h1').length, 1)
      assert.equal(document.querySelectorAll('.license-section').length, policy.sections.length)
      assert.ok(document.body.textContent.includes(policy.notice))
      assert.ok(document.querySelector('a[href="mailto:2310502033@qq.com"]'))
      for (const section of policy.sections) {
        const rendered = document.getElementById(section.id)
        assert.ok(rendered)
        assert.ok([...document.querySelectorAll('.page-outline button')].some((button) => button.textContent.endsWith(section.title)), 'outline exposes each policy chapter')
        for (const paragraph of section.paragraphs) assert.ok(rendered.textContent.includes(paragraph))
      }
    }
  } finally {
    await act(async () => root.unmount())
    await server.close()
    dom.window.close()
  }
})
