
import { SITE_CONFIG } from '../config'
import type { Copy } from '../content'

function FooterLink({ linkKey, label }: { linkKey: string; label: string }) {
  const href = (SITE_CONFIG.footerLinks as Record<string, string>)[linkKey]
  if (href) {
    const external = href.startsWith('http')
    return <li><a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}{external && null}</a></li>
  }
  return <li><span className="pending" aria-disabled="true">{label}</span></li>
}

export function SiteFooter({ t }: { t: Copy }) {
  const columns = t.footer.columns
  return (
    <footer className="site-footer">
      <div className="content-wrap footer-cols">
        <nav className="footer-col" aria-label={columns.community.title}><h3>{columns.community.title}</h3><ul>{columns.community.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
        <nav className="footer-col" aria-label={columns.follow.title}><h3>{columns.follow.title}</h3><ul>{columns.follow.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
        <nav className="footer-col" aria-label={columns.docs.title}><h3>{columns.docs.title}</h3><ul>{columns.docs.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
        <nav className="footer-col" aria-label={columns.more.title}><h3>{columns.more.title}</h3><ul>{columns.more.items.map((item) => <FooterLink key={item.key} linkKey={item.key} label={item.label} />)}</ul></nav>
      </div>
      <div className="content-wrap footer-bottom">
        <div className="footer-logo"><img src="/assets/moonsprite-logo.svg" width="40" height="40" alt="" /><strong>MoonSprite</strong></div>
        <p>{t.footer.copyright}</p>
      </div>
    </footer>
  )
}
