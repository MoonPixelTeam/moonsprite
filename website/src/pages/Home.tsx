import { useEffect, useState } from 'react'
import { ArrowRight, Braces, ChevronLeft, ChevronRight, FileDown, Film, GitFork, Grid2x2, Lasso, Layers, Monitor, PaintBucket, Palette, PanelsTopLeft, Pencil, ShieldCheck, Shapes, SprayCan, Type } from 'lucide-react'
import type { Copy } from '../content'
import { AppWindow, ProductImage, SteamButton } from '../ui'
import { SITE_CONFIG } from '../config'

const HERO_SLIDES = ['/assets/hero/hero-1.png', '/assets/hero/hero-2.png', '/assets/hero/hero-3.png', '/assets/hero/hero-4.png', '/assets/hero/hero-5.png', '/assets/hero/hero-6.png']
const PALETTE = ['#090a0d', '#10141b', '#171a21', '#20242d', '#2979ff', '#478bff', '#212c40', '#ffab26', '#ef5350', '#66bb6a', '#f1f4f8', '#c2cad5', '#303641', '#596271']
const featureIconMap: Record<string, typeof Pencil> = {
  pencil: Pencil,
  airbrush: SprayCan,
  selection: Lasso,
  shape: Shapes,
  fill: PaintBucket,
  text: Type,
  layers: Layers,
  film: Film,
  colors: Palette,
  tiles: Grid2x2,
  workspace: PanelsTopLeft,
  export: FileDown,
  scripting: Braces,
  windows: Monitor,
}

export function Home({ t }: { t: Copy }) {
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setSlide((value) => (value + 1) % HERO_SLIDES.length), 7000)
    return () => clearInterval(timer)
  }, [])
  const goTo = (index: number) => setSlide((index + HERO_SLIDES.length) % HERO_SLIDES.length)

  return <main id="main">
    <section className="hero" id="top">
      <div className="hero-bg" aria-hidden="true">
        {HERO_SLIDES.map((src, index) => <img key={src} src={src} alt="" className={index === slide ? 'active' : ''} />)}
      </div>
      <div className="hero-nav" aria-hidden="false">
        <button type="button" onClick={() => goTo(slide - 1)} aria-label={t.hero.prevSlide}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" onClick={() => goTo(slide + 1)} aria-label={t.hero.nextSlide}><ChevronRight aria-hidden="true" /></button>
      </div>
      <div className="content-wrap hero-inner">
        <p className="dev-badge">{t.common.dev}</p>
        <h1>{t.hero.title}</h1>
        <p className="hero-subtitle">{t.hero.subtitle}</p>
        <p className="hero-description">{t.hero.description}</p>
        <div className="hero-actions"><SteamButton label={t.common.steam} soon={t.common.steamSoon} /><a className="button secondary" href={SITE_CONFIG.githubUrl} target="_blank" rel="noopener noreferrer"><GitFork aria-hidden="true" />{t.common.github}</a></div>
        <div className="hero-meta"><span><Monitor aria-hidden="true" />{t.hero.platform}</span><span><ShieldCheck aria-hidden="true" />{t.hero.license}</span></div>
        <div className="hero-window"><AppWindow title={t.hero.windowTitle}><ProductImage name="workspace-v3" alt={t.hero.imageAlt} priority /></AppWindow></div>
      </div>
      <div className="palette-strip" aria-hidden="true">{PALETTE.map((color) => <span key={color} style={{ background: color }} title={color} />)}</div>
    </section>

    <section className="features" id="features">
      <div className="content-wrap">
        <div className="section-title"><span>{t.features.eyebrow}</span><h2>{t.features.title}</h2><p>{t.features.description}</p></div>
        <div className="masonry">
          {t.features.items.map((item) => {
            const Icon = featureIconMap[item.icon] ?? Pencil
            return <article className="masonry-card" key={item.title}>
              <div className="panel-header"><Icon aria-hidden="true" /><strong>{item.title}</strong></div>
              <div className="gif-placeholder" aria-hidden="true"><span className="gif-tag">GIF</span></div>
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
          {[1, 2, 3].map((number, index) => <figure key={number} className={`showcase-item item-${number}`} data-file={t.work.files[index]}>
            <img src={`/assets/showcase/showcase-${number}-1536.webp`} srcSet={`/assets/showcase/showcase-${number}-768.webp 768w, /assets/showcase/showcase-${number}-1536.webp 1536w`} sizes={number === 1 ? '(max-width: 900px) 94vw, 760px' : '(max-width: 900px) 94vw, 470px'} width="1536" height="1024" loading="lazy" decoding="async" alt={t.work.itemAlt[index]} />
          </figure>)}
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
