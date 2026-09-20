import { useMemo, useState } from 'react'
import { Button, IconButton } from '../ui'
import { ArrowLeft, Banknote, ImagePlus, KeyRound, PackagePlus, Pencil, ShieldAlert, Trash2, TrendingUp, Upload } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useAccount } from '../account/store'
import { useStudio, type StudioProduct } from '../studio/store'
import { Select } from '../ui/Select'
import { PackCard } from '../market/PackCard'
import { studioToProduct } from '../market/catalogue'
import { cnyToUsd, formatPrice, productCopy } from '../market/catalog'
import type { Cart } from '../market/cart'

/** The preview card is not for sale, so it gets a cart that ignores every action. */
const previewCart: Cart = {
  lines: [], count: 0, subtotal: 0,
  has: () => false, add: () => {}, setQuantity: () => {}, remove: () => {}, clear: () => {},
}

/**
 * Seller dashboard. Reachable only by its own link or #/studio — it is deliberately
 * absent from the site navigation, since visitors should never stumble into it.
 */
export function StudioPage({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const { account } = useAccount()
  const studio = useStudio()
  const [password, setPassword] = useState('')
  const [gateError, setGateError] = useState(false)

  if (!account) {
    return <StudioShell t={t} title={strings.title} subtitle={strings.subtitle} back={strings.back}>
      <div className="account-panel">
        <h2><ShieldAlert aria-hidden="true" />{strings.needAccount}</h2>
        <p className="account-empty">{strings.needAccountBody}</p>
        <Button variant="primary" href="#/account">{t.accountPage.signIn}</Button>
      </div>
    </StudioShell>
  }

  if (!studio.unlocked) {
    return <StudioShell t={t} title={strings.title} subtitle={strings.subtitle} back={strings.back}>
      <div className="account-panel studio-gate">
        <h2><KeyRound aria-hidden="true" />{strings.gateTitle}</h2>
        <p className="account-empty">{strings.gateBody}</p>
        <form className="account-form" onSubmit={(event) => {
          event.preventDefault()
          // Prototype gate: the password to reach the seller tools, not an account credential.
          if (password === 'studio') {
            studio.setUnlocked(true)
            setGateError(false)
            return
          }
          setGateError(true)
        }}>
          <label>
            <span>{strings.gateLabel}</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" />
          </label>
          {gateError && <p className="account-error" role="alert">{strings.gateError}</p>}
          <Button type="submit" variant="primary">{strings.gateEnter}</Button>
        </form>
        <p className="studio-hint">{strings.gateHint}</p>
      </div>
    </StudioShell>
  }

  return <StudioShell t={t} title={strings.title} subtitle={strings.subtitle} back={strings.back} unlocked onLeave={() => studio.setUnlocked(false)}>
    <div className="studio-toolbar">
      <Button variant="primary" href="#/studio/publish"><PackagePlus aria-hidden="true" />{strings.publishCta}</Button>
    </div>

    <div className="studio-metrics">
      <Metric label={strings.gross} value={formatPrice(studio.gross)} hint={strings.grossHint} />
      <Metric label={strings.platformFee} value={formatPrice(studio.platformFee)} hint={strings.platformFeeHint(studio.platformFeePercent)} />
      <Metric label={strings.net} value={formatPrice(studio.net)} hint={strings.netHint} accent />
      <Metric label={strings.available} value={formatPrice(studio.available)} hint={strings.availableHint} accent />
    </div>

    <div className="studio-grid">
      <WithdrawalPanel t={t} language={language} />
    </div>
    <PublishedPacks t={t} language={language} />
    <SalesTable t={t} language={language} />
  </StudioShell>
}

function StudioShell({ t, title, subtitle, back, unlocked, onLeave, children }: {
  t: Copy
  title: string
  subtitle: string
  back: string
  unlocked?: boolean
  onLeave?: () => void
  children: React.ReactNode
}) {
  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <nav className="pack-crumbs" aria-label={title}>
          <a href="#/account"><ArrowLeft aria-hidden="true" />{back}</a>
          <span>{t.studioPage.eyebrow}</span>
        </nav>
        <div className="shelf-head">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
    </section>
    <section className="market-browse">
      <div className="content-wrap purchases-wrap">
        {unlocked && <div className="studio-actions">
          <span className="studio-badge"><Upload aria-hidden="true" />{t.studioPage.unlocked}</span>
          <Button size="compact" onClick={onLeave}>{t.studioPage.lock}</Button>
        </div>}
        <div className="account-panel studio-prototype">
          <h2><ShieldAlert aria-hidden="true" />{t.studioPage.prototypeTitle}</h2>
          <p>{t.studioPage.prototypeBody}</p>
        </div>
        {children}
      </div>
    </section>
  </main>
}

function Metric({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return <div className={accent ? 'studio-metric accent' : 'studio-metric'}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </div>
}

function WithdrawalPanel({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const studio = useStudio()
  const [amount, setAmount] = useState('')
  const [destination, setDestination] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const message = (code: string) => code === 'insufficient' ? strings.errorInsufficient
    : code === 'destination' ? strings.errorDestination
      : strings.errorAmount

  return <div className="account-panel">
    <h2><Banknote aria-hidden="true" />{strings.withdraw}</h2>
    <dl className="account-facts">
      <div><dt>{strings.net}</dt><dd>{formatPrice(studio.net)}</dd></div>
      <div><dt>{strings.withdrawn}</dt><dd>{formatPrice(studio.withdrawn)}</dd></div>
      <div><dt>{strings.available}</dt><dd>{formatPrice(studio.available)}</dd></div>
    </dl>
    <form className="account-form" onSubmit={async (event) => {
      event.preventDefault()
      const result = await studio.requestWithdrawal(Number(amount), destination)
      if (!result.ok) {
        setError(message(result.error))
        setDone(false)
        return
      }
      setError(null)
      setDone(true)
      setAmount('')
    }}>
      <label>
        <span>{strings.withdrawAmount}</span>
        <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={String(Math.max(0, Math.round(studio.available / 7.2)))} required />
        <small className="studio-field-hint">{strings.fieldPriceHint}</small>
      </label>
      <label>
        <span>{strings.withdrawTo}</span>
        <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={strings.withdrawToPlaceholder} required />
      </label>
      {error && <p className="account-error" role="alert">{error}</p>}
      {done && <p className="studio-ok" role="status">{strings.withdrawRequested}</p>}
      <Button type="submit" variant="primary" disabled={studio.available <= 0}>{strings.withdrawSubmit}</Button>
    </form>
    {studio.withdrawals.length > 0 && <ul className="studio-withdrawals">
      {studio.withdrawals.map((item) => <li key={item.id}>
        <strong>{formatPrice(item.amount)}</strong>
        <span>{item.destination}</span>
        <em>{strings.statusRequested}</em>
        <time>{new Date(item.requestedAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}</time>
      </li>)}
    </ul>}
  </div>
}

function PublishedPacks({ t, language }: { t: Copy; language: Language }) {
  const strings = t.studioPage
  const studio = useStudio()
  const products = useMemo(() => studio.products.map(studioToProduct), [studio.products])

  return <div className="account-panel">
    <h2><TrendingUp aria-hidden="true" />{strings.published}<span className="order-count">{products.length}</span></h2>
    {products.length === 0
      ? <p className="account-empty">{strings.noPublished}</p>
      : <ul className="studio-packs">
        {products.map((product) => <li key={product.id}>
          <span className="studio-pack-art">
            {product.image ? <img src={product.image} alt="" /> : <span className="studio-pack-empty" />}
          </span>
          <span className="studio-pack-copy">
            <strong>{product.name[language]}</strong>
            <small>{[productCopy(product.size, language), product.formats.join(' · ')].filter(Boolean).join(' · ') || '—'}</small>
          </span>
          <span className="studio-pack-price">{formatPrice(product.price)}</span>
          {/* Editing reopens the publish page with this pack loaded. */}
          <Button size="compact" icon={<Pencil aria-hidden="true" />} href={`#/studio/publish/${product.id}`}>{strings.edit}</Button>
          <IconButton label={strings.unpublish} onClick={() => studio.unpublish(product.id)} icon={<Trash2 aria-hidden="true" />} />
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
      : <table className="studio-table">
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
      </table>}
  </div>
}
