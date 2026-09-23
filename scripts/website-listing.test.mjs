import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(new URL('../website/package.json', import.meta.url))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const { createElement: h } = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

test('published details survive storage, render in the real detail page and retry failed files without duplicates', async () => {
  const memory = new Map()
  globalThis.localStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) }
  globalThis.window = new EventTarget()
  const server = await createServer({ root: fileURLToPath(new URL('../website', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { localAdapter: api, writeStudioUnlocked } = await server.ssrLoadModule('/src/api/local.ts')
    const { studioToProduct, CatalogueProvider } = await server.ssrLoadModule('/src/market/catalogue.ts')
    const { bundleItems, bundleValue } = await server.ssrLoadModule('/src/market/catalog.ts')
    const { frameSrc } = await server.ssrLoadModule('/src/market/PixelArt.tsx')
    const { saveListing } = await server.ssrLoadModule('/src/studio/save-listing.ts')
    const seller = await api.auth.register({ name: 'Listing seller', email: 'listing@example.com', password: 'password123' })
    assert.equal(seller.ok, true)
    writeStudioUnlocked(true, seller.account.id)
    const input = {
      name: { zh: '完整资源', en: 'Complete pack' }, tagline: { zh: '简短介绍', en: 'Short summary' },
      body: { zh: '完整正文'.repeat(150), en: 'Detailed English description' },
      category: 'assets', price: 10, size: '32 × 32', formats: ['PNG'], tags: ['pixel'],
      includes: [{ zh: '包含人物素材', en: 'Character artwork included' }],
      image: 'data:image/png;base64,Y292ZXI=', previews: ['data:image/png;base64,cHJldmlldw=='],
    }
    const published = await api.studio.publish(input)
    assert.equal(published.ok, true)
    const stored = (await api.studio.products())[0]
    assert.deepEqual(stored.includes, input.includes)
    assert.deepEqual(stored.previews, input.previews)
    assert.equal(stored.body.zh.length, input.body.zh.length)
    const bundleResult = await api.studio.publish({ ...input, category: 'bundles', packs: [stored.id], price: 8 })
    assert.equal(bundleResult.ok, true)
    const catalogue = await api.catalogue.all()
    const bundle = studioToProduct(catalogue.find((item) => item.id === bundleResult.data.id), catalogue)
    assert.equal(bundleItems(bundle)[0].id, stored.id)
    assert.equal(bundleValue(bundle), 10)
    assert.deepEqual(bundleItems(studioToProduct({ ...stored, category: 'bundles', packs: undefined })), [])
    const sheet = { dir: 'uploaded', sources: ['data:image/png;base64,MA==', 'data:image/png;base64,MQ=='], frames: 2, frameWidth: 16, frameHeight: 16, duration: 500 }
    const pet = studioToProduct(JSON.parse(JSON.stringify({ ...stored, category: 'pets', animations: { order: ['idle'], sheets: { idle: sheet }, labels: { idle: { zh: '待机', en: 'Idle' } }, idle: sheet } })))
    assert.equal(frameSrc(pet.animations.idle, 1), sheet.sources[1])
    const { PackDetailPage } = await server.ssrLoadModule('/src/pages/Market.tsx')
    const { copy } = await server.ssrLoadModule('/src/content.ts')
    const { AccountProvider } = await server.ssrLoadModule('/src/account/store.tsx')
    const { DataProvider } = await server.ssrLoadModule('/src/data/store.tsx')
    const { CartProvider } = await server.ssrLoadModule('/src/market/cart.tsx')
    const render = (product, language) => renderToStaticMarkup(h(AccountProvider, null, h(DataProvider, null, h(CatalogueProvider, null, h(CartProvider, { products: [product] }, h(PackDetailPage, { t: copy[language], language, previewProduct: product }))))))
    const html = render(studioToProduct(stored), 'en')
    assert.ok(html.includes('Character artwork included'))
    assert.ok(html.includes('Detailed English description'))
    assert.ok(html.includes(input.previews[0]))
    assert.ok(!html.includes('id="main"'))
    assert.ok(html.includes('disabled'))
    assert.ok(render(bundle, 'zh').includes('完整资源'))
    assert.ok(render(pet, 'en').includes('Idle'))

    let savedId
    let publishes = 0
    let updates = 0
    let failUpload = true
    const dependencies = {
      studio: {
        publish: async () => { publishes++; return { ok: true, id: 'retained-listing' } },
        update: async (id) => { assert.equal(id, 'retained-listing'); updates++; return { ok: true } },
      },
      payload: input, file: new File(['bytes'], 'pack.zip'),
      rememberId: (id) => { savedId = id },
      putFile: async (id) => { assert.equal(id, savedId); if (failUpload) throw new Error('simulated quota failure') },
    }
    assert.deepEqual(await saveListing(dependencies), { ok: false, error: 'file' })
    failUpload = false
    assert.deepEqual(await saveListing({ ...dependencies, savedId }), { ok: true })
    assert.equal(publishes, 1)
    assert.equal(updates, 1)
    assert.equal((await api.studio.update(stored.id, { ...input, body: { zh: '修订正文', en: 'Revised' } })).ok, true)
    assert.equal((await api.studio.products()).find((item) => item.id === stored.id).body.en, 'Revised')
  } finally { await server.close() }
})
