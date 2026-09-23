import { competitionWorks } from '../competitions/data'
import { MediaPreview, type PreviewMedia } from '../ui/MediaPreview'
import { useState } from 'react'
import { PixelArrowRight as ArrowRight, PixelChevronLeft as ChevronLeft, PixelChevronRight as ChevronRight } from '../ui/icons'
import type { Copy, Language } from '../content'
import { Button, IconButton, SteamButton, SectionHeading } from '../ui'
import { SITE_CONFIG } from '../config'
import { useCatalogue } from '../market/catalogue'
import { PackGrid } from '../market/PackCard'

const HERO_SLIDES = [
  '/assets/hero/home-banner-fire.png',
  '/assets/hero/home-banner-crystal.png',
  '/assets/hero/home-banner-coast.png',
  '/assets/hero/home-banner-hall.png',
]


export function Home({ t, language }: { t: Copy; language: Language }) {
  const [slide, setSlide] = useState(0)
  const [preview, setPreview] = useState<PreviewMedia | null>(null)
  const { products } = useCatalogue()

  const goTo = (index: number) => setSlide((index + HERO_SLIDES.length) % HERO_SLIDES.length)
  const teaser = products.slice(0, 8)
  return <main id="main" className="home-main">
    <section className="hero" id="top">
      <div className="hero-stage">
        <div className="hero-bg" aria-hidden="true">
          {HERO_SLIDES.map((src, index) => <img key={src} src={src} alt="" className={index === slide ? 'active' : ''} />)}
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-nav" aria-hidden="false">
          <IconButton className="hero-arrow" label={t.hero.prevSlide} onClick={() => goTo(slide - 1)} icon={<ChevronLeft aria-hidden="true" />} />
          <IconButton className="hero-arrow" label={t.hero.nextSlide} onClick={() => goTo(slide + 1)} icon={<ChevronRight aria-hidden="true" />} />
        </div>
        <div className="content-wrap hero-inner">
          <div className="hero-copy">
            <p className="dev-badge">{t.common.dev}</p>
            <h1>{t.hero.title}</h1>
            <div className="hero-actions"><SteamButton compact label={t.common.steam} soon={t.common.steamSoon} /><a className="hero-github" href={SITE_CONFIG.githubUrl} target="_blank" rel="noopener noreferrer">{t.common.github}<ArrowRight aria-hidden="true" /></a></div>
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
        <SectionHeading eyebrow={t.features.eyebrow} title={t.features.title} description={t.features.description} actions={<Button href="#/docs">{language === 'zh' ? '查看更多功能' : 'Explore all features'}<ArrowRight aria-hidden="true" /></Button>} />
        <div className="masonry">
          {t.features.items.map((item) => <article className="masonry-card" key={item.icon}>
            <div className="panel-header"><strong>{item.title}</strong></div>
            <button type="button" className="gif-placeholder" aria-label={`${language === 'zh' ? '放大预览：' : 'Enlarge preview: '}${item.title}`} onClick={() => setPreview({ src: item.gif, title: item.title, description: item.gif ? item.body : (language === 'zh' ? '功能演示 GIF 待补充。' : 'The feature GIF will be added later.') })}>
              {item.gif && <img src={item.gif} alt={item.title} loading="lazy" decoding="async" />}
              <span className="gif-tag">GIF</span>
            </button>
            <p className="masonry-copy">{item.body}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section className="showcase" id="work">
      <div className="content-wrap">
        <SectionHeading eyebrow={t.work.eyebrow} title={t.work.title} description={t.work.description} />
        <div className="showcase-grid">
          {competitionWorks.filter((work) => work.featured).slice(0, 6).map((work) => <figure key={work.id} className="showcase-item">
            <a href="#/competitions" aria-label={`${work.title[language]} · ${language === 'zh' ? '查看比赛作品' : 'View competition'}`}><img src={work.image} loading="lazy" decoding="async" alt={work.title[language]} /></a>
          </figure>)}
        </div>
        <div className="teaser-actions"><Button href="#/competitions">{language === 'zh' ? '查看比赛作品' : 'View competition'}<ArrowRight aria-hidden="true" /></Button></div>
      </div>
    </section>

    <section className="market-teaser">
      <div className="content-wrap">
        <SectionHeading eyebrow={t.marketTeaser.eyebrow} title={t.marketTeaser.title} />
        <PackGrid products={teaser} t={t} language={language} className="featured" compact />
        <div className="teaser-actions">
          <Button variant="primary" href="#/market">{t.marketTeaser.cta}<ArrowRight aria-hidden="true" /></Button>
        </div>
      </div>
    </section>

    <section className="final-cta">
      <div className="content-wrap">
        <div><span>{t.cta.eyebrow}</span><h2>{t.cta.title}</h2><p>{t.cta.body}</p></div>
        <div className="final-actions"><SteamButton label={t.common.steam} soon={t.common.steamSoon} /><a href={SITE_CONFIG.githubUrl} target="_blank" rel="noopener noreferrer">{t.common.github}<ArrowRight aria-hidden="true" /></a></div>
      </div>
    </section>
    <MediaPreview media={preview} closeLabel={language === 'zh' ? '关闭' : 'Close'} onClose={() => setPreview(null)} />
  </main>
}
