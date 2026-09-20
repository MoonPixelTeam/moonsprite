import { useEffect, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, GitFork } from 'lucide-react'
import type { Copy, Language } from '../content'
import { Button, SteamButton } from '../ui'
import { SITE_CONFIG } from '../config'
import { toolIconSvgs } from '../toolIcons'
import { MARKET_PRODUCTS, type MarketProduct } from '../market/catalog'
import { PackGrid } from '../market/PackCard'

const HERO_SLIDES = [
  '/assets/hero/home-banner-fire.png',
  '/assets/hero/home-banner-crystal.png',
  '/assets/hero/home-banner-coast.png',
  '/assets/hero/home-banner-hall.png',
]
const SHOWCASE_IMAGES = ['/assets/hero/hero-1.png', '/assets/hero/hero-2.png', '/assets/hero/hero-3.png', '/assets/hero/hero-4.png', '/assets/hero/hero-5.png', '/assets/hero/hero-6.png']

/**
 * The homepage features the leading packs — the same ones the market shelf leads with —
 * and renders them with the market's own card, so a pack looks and behaves the same
 * wherever it appears and there is only one card to keep in step.
 */
const TEASER_PACKS = ['pet-nailong', 'asset-cavern', 'asset-character']

export function Home({ t, language }: { t: Copy; language: Language }) {
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => setSlide((value) => (value + 1) % HERO_SLIDES.length), 7000)
    return () => clearInterval(timer)
  }, [])
  const goTo = (index: number) => setSlide((index + HERO_SLIDES.length) % HERO_SLIDES.length)
  const teaser = TEASER_PACKS
    .map((id) => MARKET_PRODUCTS.find((product) => product.id === id))
    .filter((product): product is MarketProduct => Boolean(product))

  return <main id="main" className="home-main">
    <section className="hero" id="top">
      <div className="hero-stage">
        <div className="hero-bg" aria-hidden="true">
          {HERO_SLIDES.map((src, index) => <img key={src} src={src} alt="" className={index === slide ? 'active' : ''} />)}
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-nav" aria-hidden="false">
          <button type="button" onClick={() => goTo(slide - 1)} aria-label={t.hero.prevSlide}><ChevronLeft aria-hidden="true" /></button>
          <button type="button" onClick={() => goTo(slide + 1)} aria-label={t.hero.nextSlide}><ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="content-wrap hero-inner">
          <div className="hero-copy">
            <p className="dev-badge">{t.common.dev}</p>
            <h1>{t.hero.title}</h1>
            <div className="hero-actions"><SteamButton compact label={t.common.steam} soon={t.common.steamSoon} /><a className="hero-github" href={SITE_CONFIG.githubUrl} target="_blank" rel="noopener noreferrer"><GitFork aria-hidden="true" />{t.common.github}<ArrowRight aria-hidden="true" /></a></div>
          </div>
        </div>
        <div className="hero-pagination" aria-label="Gallery slides">
          <span aria-hidden="true">{String(slide + 1).padStart(2, '0')} / {String(HERO_SLIDES.length).padStart(2, '0')}</span>
          <div className="hero-dots">
            {HERO_SLIDES.map((src, index) => <button key={src} type="button" className={index === slide ? 'active' : ''} onClick={() => goTo(index)} aria-label={`${t.hero.title} ${index + 1}`} aria-current={index === slide ? 'true' : undefined} />)}
          </div>
        </div>
      </div>
    </section>

    <section className="features" id="features">
      <div className="content-wrap">
        <div className="section-title"><span>{t.features.eyebrow}</span><h2>{t.features.title}</h2><p>{t.features.description}</p></div>
        <div className="masonry">
          {t.features.items.map((item) => {
            const svg = toolIconSvgs[item.icon]
            return <article className="masonry-card" key={item.title}>
              <div className="panel-header"><span className="pixel-icon" dangerouslySetInnerHTML={{ __html: svg }} /><strong>{item.title}</strong></div>
              <div className="gif-placeholder" aria-hidden="true"><span className="pixel-icon large" dangerouslySetInnerHTML={{ __html: svg }} /><span className="gif-tag">GIF</span></div>
              <p className="masonry-copy">{item.body}</p>
            </article>
          })}
        </div>
      </div>
    </section>

    <section className="showcase" id="work">
      <div className="content-wrap">
        <div className="section-title"><span>{t.work.eyebrow}</span><h2>{t.work.title}</h2><p>{t.work.description}</p></div>
        <div className="showcase-grid">
          {SHOWCASE_IMAGES.map((src, index) => <figure key={src} className="showcase-item">
            <img src={src} loading="lazy" decoding="async" alt={t.work.itemAlt[index]} />
          </figure>)}
        </div>
      </div>
    </section>

    <section className="market-teaser">
      <div className="content-wrap">
        <div className="section-title">
          <span>{t.marketTeaser.eyebrow}</span>
          <h2>{t.marketTeaser.title}</h2>
          <p>{t.marketTeaser.description}</p>
        </div>
        <PackGrid products={teaser} t={t} language={language} className="featured" />
        <div className="teaser-actions">
          <Button variant="primary" href="#/market">{t.marketTeaser.cta}<ArrowRight aria-hidden="true" /></Button>
          <span>{t.marketTeaser.note}</span>
        </div>
      </div>
    </section>

    <section className="final-cta">
      <div className="content-wrap">
        <div><span>{t.cta.eyebrow}</span><h2>{t.cta.title}</h2><p>{t.cta.body}</p></div>
        <div className="final-actions"><SteamButton label={t.common.steam} soon={t.common.steamSoon} /><a href={SITE_CONFIG.githubUrl} target="_blank" rel="noopener noreferrer">{t.common.github}<ArrowRight aria-hidden="true" /></a></div>
      </div>
    </section>
  </main>
}
