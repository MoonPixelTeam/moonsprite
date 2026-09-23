import { Input, Textarea } from '../ui'
import { useEffect, useState } from 'react'
import { PixelFileArchive as FileArchive, PixelPencil as Pencil } from '../ui/icons'
import type { Copy, Language } from '../content'
import { copy } from '../content'
import { useStudio, type StudioProduct } from '../studio/store'
import { Alert, Button, Panel, ChipField, Field, FileField, FormField, Select } from '../ui'
import { PackCard } from '../market/PackCard'
import { studioToProduct } from '../market/catalogue'
import { cnyToUsd, formatPrice, usdToCny } from '../market/catalog'
import { getFile, putFile } from '../api/files'
import type { Cart } from '../market/cart'
import { ListingFields, type ListingDetails } from '../studio/ListingFields'
import { PackDetailPage } from './Market'
import { saveListing } from '../studio/save-listing'

/** The preview card is not for sale, so it gets a cart that ignores every action. */
const previewCart: Cart = {
  lines: [], count: 0, subtotal: 0,
  has: () => false, add: () => {}, setQuantity: () => {}, remove: () => {}, clear: () => {},
}

export function StudioPublish({ t, language, editing, onDone }: {
  t: Copy
  language: Language
  /** When set, the form opens that published pack for editing instead of creating one. */
  editing?: StudioProduct | null
  onDone?: () => void
}) {
  const strings = t.studioPage
  const studio = useStudio()

  const [name, setName] = useState('')
  const [cny, setCny] = useState('')
  const [category, setCategory] = useState<StudioProduct['category']>('assets')
  const [tagline, setTagline] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [english, setEnglish] = useState({ name: '', tagline: '', body: '' })
  const [details, setDetails] = useState<ListingDetails>({})
  const [mediaBusy, setMediaBusy] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewLanguage, setPreviewLanguage] = useState(language)
  const [savedId, setSavedId] = useState<string | undefined>(editing?.id)
  const [sizes, setSizes] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [cover, setCover] = useState<string | undefined>()
  const [packFile, setPackFile] = useState<{ name: string; size: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  // Opening a pack for editing loads it in; leaving edit mode clears the form again.
  useEffect(() => {
    if (!editing) return
    setName(editing.name.zh)
    setCny(String(usdToCny(editing.price)))
    setCategory(editing.category)
    setTagline(editing.tagline.zh)
    setBodyText(editing.body.zh)
    setEnglish({ name: editing.name.en, tagline: editing.tagline.en, body: editing.body.en })
    setDetails({ includes: editing.includes, previews: editing.previews, packs: editing.packs, animations: editing.animations })
    setSavedId(editing.id)
    setSizes(editing.size ? [editing.size] : [])
    setFormats(editing.formats)
    setTags(editing.tags ?? [])
    setCover(editing.image)
    setMessage(null)
    setTried(false)
    // A pack being edited keeps whatever file it already has; the picker only replaces it.
    let active = true
    setMediaBusy(true)
    void getFile(editing.id).then((stored) => {
      if (!active) return
      setPackFile(stored ? { name: stored.name, size: stored.size } : null)
      setMediaBusy(false)
    })
    return () => { active = false }
  }, [editing])

  const priceUsd = cnyToUsd(Number(cny))
  const sizeText = sizes.join(' · ')
  const missing = [
    name.trim().length < 2 ? strings.fieldName : null,
    !(Number(cny) > 0) ? strings.fieldPrice : null,
    formats.length === 0 ? strings.fieldFormats : null,
    // The buyer downloads this; a listing without it cannot be delivered.
    !packFile ? strings.fieldFile : null,
    category === 'bundles' && !(details.packs?.length) ? (language === 'zh' ? '合集成员' : 'Bundle members') : null,
    category === 'bundles' && details.packs?.some((id) => !studio.products.some((product) => product.id === id && product.category !== 'bundles')) ? (language === 'zh' ? '合集包含已下架资源，请重新选择成员' : 'Remove unavailable bundle members') : null,
  ].filter((item): item is string => Boolean(item))

  const readCover = (file: File | undefined) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 512 * 1024) { setMessage(language === 'zh' ? '封面需为 PNG / JPG / WebP / GIF，且不超过 512 KB。' : 'Use PNG / JPG / WebP / GIF under 512 KB.'); return }
    setMediaBusy(true)
    const reader = new FileReader()
    reader.onload = () => setCover(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => setMessage(strings.errorCover)
    reader.onloadend = () => setMediaBusy(false)
    reader.readAsDataURL(file)
  }

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const readPackFile = (file: File | undefined) => {
    if (!file) return
    setMessage(null)
    setPackFile({ name: file.name, size: file.size })
    setPendingFile(file)
  }

  const reset = () => {
    setName(''); setCny(''); setTagline(''); setBodyText(''); setSizes([])
    setFormats([]); setTags([]); setCover(undefined); setTried(false); setMessage(null)
    setCategory('assets'); setPackFile(null); setPendingFile(null)
    setEnglish({ name: '', tagline: '', body: '' }); setDetails({}); setSavedId(undefined)
  }

  const [busy, setBusy] = useState(false)
  const payload = {
    name: { zh: name.trim(), en: english.name.trim() || name.trim() },
    tagline: { zh: tagline.trim(), en: english.tagline.trim() || tagline.trim() },
    body: { zh: bodyText.trim(), en: english.body.trim() || bodyText.trim() },
    price: priceUsd, category, size: sizeText, formats, tags, image: cover,
    previews: details.previews,
    includes: details.includes?.filter((item) => item.zh.trim() || item.en.trim()).map((item) => ({ zh: item.zh.trim() || item.en.trim(), en: item.en.trim() || item.zh.trim() })),
    packs: category === 'bundles' ? details.packs : undefined,
    animations: category === 'pets' ? details.animations : undefined,
  }
  const previewProduct = studioToProduct({ ...payload, id: savedId ?? 'preview', publishedAt: editing?.publishedAt ?? 0 }, studio.products)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || mediaBusy) return
    setTried(true)
    if (missing.length > 0) return
    setBusy(true)
    try {
    const result = await saveListing({ studio, payload, savedId, file: pendingFile, rememberId: setSavedId, putFile })
    if (!result.ok) {
      setMessage(result.error === 'file' ? `${strings.errorFile} ${language === 'zh' ? '商品已保留为待审核状态，再次提交会重试此商品。' : 'The listing is retained for review. Submit again to retry this listing.'}` : result.error === 'price' ? strings.errorPrice : strings.errorStorage)
      return
    }
    setPendingFile(null)
    setMessage(editing ? strings.updated : strings.published)
    onDone?.()
    } catch {
      setMessage(strings.errorStorage)
    } finally { setBusy(false) }
  }

  const sizePresets = strings.presetSizes[category] ?? []

  if (previewMode) return <div className="studio-detail-preview">
    <div className="studio-submit">
      <Button size="compact" onClick={() => setPreviewMode(false)}>{language === 'zh' ? '返回编辑' : 'Back to editor'}</Button>
      <Button size="compact" onClick={() => setPreviewLanguage(previewLanguage === 'zh' ? 'en' : 'zh')}>{previewLanguage === 'zh' ? 'English' : '中文'}</Button>
      <span>{language === 'zh' ? '详情预览 · 尚未提交' : 'Detail preview · Not submitted'}</span>
    </div>
    <div onClickCapture={(event) => { if ((event.target as HTMLElement).closest('a')) { event.preventDefault(); event.stopPropagation() } }}>
      <PackDetailPage t={copy[previewLanguage]} language={previewLanguage} previewProduct={previewProduct} />
    </div>
  </div>

  return <div className="studio-publish">
    {editing && <p className="studio-editing">
      <Pencil aria-hidden="true" />{strings.editHint}
    </p>}
    {!editing && <p className="studio-hint">{strings.publishNote}</p>}

    <div className="studio-publish-grid">
      <form className="account-form studio-form" onSubmit={submit} noValidate>
        <fieldset className="studio-form-fields" disabled={busy || mediaBusy}>
        <Panel title={strings.groupBasics} className="studio-fieldset">
          <Field
            label={strings.fieldName}
            badge={strings.required}
            invalid={tried && name.trim().length < 2}
            counter={strings.counter(name.length, 48)}>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={48} />
          </Field>
          <div className="studio-row">
            <Field
              label={strings.fieldPrice}
              badge={strings.required}
              invalid={tried && !(Number(cny) > 0)}
              hint={<>
                {strings.fieldPriceHint}
                {priceUsd > 0 && <> · {strings.fieldPriceConverted(formatPrice(priceUsd, language))}</>}
              </>}>
              <Input type="number" min="1" step="1" value={cny} onChange={(event) => setCny(event.target.value)} placeholder="29" />
            </Field>
            <FormField label={strings.fieldCategory}>
              <Select
                value={category}
                label={strings.fieldCategory}
                onChange={(next) => { setCategory(next); setSizes([]) }}
                options={[
                  { value: 'assets', label: t.marketPage.categories.assets },
                  { value: 'pets', label: t.marketPage.categories.pets },
                  { value: 'bundles', label: t.marketPage.categories.bundles },
                  { value: 'extensions', label: t.marketPage.categories.extensions },
                  { value: 'scripts', label: t.marketPage.categories.scripts },
                ] satisfies { value: StudioProduct['category']; label: string }[]} />
            </FormField>
          </div>
        </Panel>

        <Panel title={strings.groupContents} className="studio-fieldset">
          <ChipField
            label={strings.fieldSize}
            badge={strings.optional}
            value={sizes}
            presets={sizePresets}
            onChange={setSizes}
            hint={strings.presetSizesHint}
            customPlaceholder={strings.sizeCustomPlaceholder}
            addLabel={strings.addValue}
            removeLabel={strings.fieldCoverRemove} />
          <ChipField
            label={strings.fieldFormats}
            badge={strings.required}
            value={formats}
            presets={strings.presetFormats}
            onChange={setFormats}
            invalid={tried && formats.length === 0}
            customPlaceholder={strings.formatCustomPlaceholder}
            addLabel={strings.addValue}
            removeLabel={strings.fieldCoverRemove} />
        </Panel>

        <Panel title={strings.groupListing} className="studio-fieldset">
          <Field
            label={strings.fieldTagline}
            badge={strings.optional}
            counter={strings.counter(tagline.length, 60)}>
            <Input value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={60} />
          </Field>
          <Field
            label={strings.fieldBody}
            badge={strings.optional}
            counter={strings.counter(bodyText.length, 5000)}>
            <Textarea rows={7} value={bodyText} onChange={(event) => setBodyText(event.target.value)} maxLength={5000} />
          </Field>
          <ChipField
            label={strings.fieldTags}
            badge={strings.optional}
            value={tags}
            presets={strings.presetTags}
            onChange={setTags}
            hint={strings.fieldTagsHint}
            customPlaceholder={strings.fieldTagsHint}
            addLabel={strings.addValue}
            removeLabel={strings.fieldCoverRemove} />
        </Panel>

        <details className="studio-translations">
          <summary>{language === 'zh' ? '英文内容（选填，未填写时使用中文）' : 'English copy (optional; falls back to Chinese)'}</summary>
          <Field label="Name"><Input maxLength={48} value={english.name} onChange={(event) => setEnglish({ ...english, name: event.target.value })} /></Field>
          <Field label="Summary"><Input maxLength={60} value={english.tagline} onChange={(event) => setEnglish({ ...english, tagline: event.target.value })} /></Field>
          <Field label="Description"><Textarea rows={7} maxLength={5000} value={english.body} onChange={(event) => setEnglish({ ...english, body: event.target.value })} /></Field>
        </details>
        <ListingFields value={details} onChange={setDetails} category={category} products={studio.products.filter((product) => product.id !== editing?.id)} language={language} onBusy={setMediaBusy} />
        <Panel title={strings.groupCover} className="studio-fieldset">
          {cover && <img src={cover} alt={strings.groupCover} className="studio-cover-preview" />}
          <p className="studio-cover-ratio-note">{language === 'zh' ? '建议使用 1:1 正方形图片（淘宝商品主图常用比例）' : 'Use a 1:1 square image, the common proportion for Taobao product covers.'}</p>
          <FileField label={strings.groupCover} file={null} onPick={readCover} disabled={busy || mediaBusy} accept="image/png,image/jpeg,image/webp,image/gif" emptyTitle={cover ? strings.fieldCoverReplace : strings.fieldCoverHint} emptyHint={strings.fieldCoverDrop} replaceLabel={strings.fieldCoverReplace} clearLabel={strings.fieldCoverRemove} />
          {cover && <Button size="compact" onClick={() => setCover(undefined)}>{strings.fieldCoverRemove}</Button>}
        </Panel>

        {/* The deliverable itself. Without it a buyer would have nothing to download.
            This is the library's FileField, not a second hand-rolled drop zone. */}
        <Panel title={strings.groupFile} className="studio-fieldset">
          <FileField
            label={strings.fieldFile}
            badge={strings.required}
            file={packFile}
            onPick={readPackFile}
            onClear={() => { setPackFile(null); setPendingFile(null) }}
            emptyTitle={strings.filePick}
            emptyHint={strings.fileDrop}
            replaceLabel={strings.fileReplace}
            clearLabel={strings.fieldCoverRemove}
            hint={strings.fileHint}
            invalid={tried && !packFile}
            icon={<FileArchive aria-hidden="true" />} />
        </Panel>

        {tried && missing.length > 0 && <Alert tone="danger" role="alert">
          {strings.missing}：{missing.join('、')}
        </Alert>}
        {message && <Alert tone={message === strings.updated || message === strings.published ? 'success' : 'danger'} role={message === strings.updated || message === strings.published ? 'status' : 'alert'}>{message}</Alert>}

        <div className="studio-submit">
          <Button size="compact" type="submit" variant="primary" disabled={busy || mediaBusy}>{editing ? strings.saveEdit : strings.publish}</Button>
          <Button size="compact" onClick={() => setPreviewMode(true)}>{language === 'zh' ? '预览完整详情页' : 'Preview full page'}</Button>
          {editing
            ? <Button size="compact" onClick={() => onDone?.()}>{strings.cancelEdit}</Button>
            : <Button size="compact" onClick={reset}>{strings.reset}</Button>}
        </div>
        </fieldset>
      </form>

      {/* The preview is the seller's own card, rendered from the real market component.
          It sits directly under the page title, so it is an h2: a heading that skips a
          level breaks screen-reader navigation. */}
      <aside className="studio-preview">
        <h2>{strings.previewTitle}</h2>
        <p className="studio-hint">{strings.previewHint}</p>
        <div className="studio-preview-card">
          <PackCard
            product={previewProduct}
            t={t}
            language={language}
            cart={previewCart}
          />
        </div>
      </aside>
    </div>
  </div>
}
