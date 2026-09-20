import { useEffect, useState } from 'react'
import { FileArchive, ImagePlus, PackagePlus, Pencil, X } from 'lucide-react'
import type { Copy, Language } from '../content'
import { useStudio, type StudioProduct } from '../studio/store'
import { Button, ChipField, Field, FileField, FormField, Select } from '../ui'
import { PackCard } from '../market/PackCard'
import { studioToProduct } from '../market/catalogue'
import { cnyToUsd, formatPrice, usdToCny } from '../market/catalog'
import { getFile, putFile } from '../api/files'
import type { Cart } from '../market/cart'

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
  const [sizes, setSizes] = useState<string[]>([])
  const [formats, setFormats] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [cover, setCover] = useState<string | undefined>()
  const [packFile, setPackFile] = useState<{ name: string; size: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fileDragging, setFileDragging] = useState(false)

  // Opening a pack for editing loads it in; leaving edit mode clears the form again.
  useEffect(() => {
    if (!editing) return
    setName(editing.name.zh)
    setCny(String(usdToCny(editing.price)))
    setCategory(editing.category)
    setTagline(editing.tagline.zh)
    setBodyText(editing.body.zh)
    setSizes(editing.size ? [editing.size] : [])
    setFormats(editing.formats)
    setTags(editing.tags ?? [])
    setCover(editing.image)
    setMessage(null)
    setTried(false)
    // A pack being edited keeps whatever file it already has; the picker only replaces it.
    void getFile(editing.id).then((stored) => {
      setPackFile(stored ? { name: stored.name, size: stored.size } : null)
    })
  }, [editing])

  const priceUsd = cnyToUsd(Number(cny))
  const sizeText = sizes.join(' · ')
  const missing = [
    name.trim().length < 2 ? strings.fieldName : null,
    !(Number(cny) > 0) ? strings.fieldPrice : null,
    formats.length === 0 ? strings.fieldFormats : null,
    // The buyer downloads this; a listing without it cannot be delivered.
    !editing && !packFile ? strings.fieldFile : null,
  ].filter((item): item is string => Boolean(item))

  const readCover = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setMessage(strings.errorCover); return }
    const reader = new FileReader()
    reader.onload = () => setCover(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => setMessage(strings.errorCover)
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
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (missing.length > 0) return
    const payload = {
      name: { zh: name.trim(), en: name.trim() },
      tagline: { zh: tagline.trim(), en: tagline.trim() },
      body: { zh: bodyText.trim(), en: bodyText.trim() },
      price: priceUsd,
      category,
      size: sizeText,
      formats,
      tags,
      image: cover,
    }
    // The two calls return different shapes: publish mints an id, update keeps one.
    let productId: string
    if (editing) {
      const result = await studio.update(editing.id, payload)
      if (!result.ok) {
        setMessage(result.error === 'price' ? strings.errorPrice : result.error === 'storage' ? strings.errorStorage : strings.errorName)
        return
      }
      productId = editing.id
    } else {
      const result = await studio.publish(payload)
      if (!result.ok) {
        setMessage(result.error === 'price' ? strings.errorPrice : result.error === 'storage' ? strings.errorStorage : strings.errorName)
        return
      }
      productId = result.id
    }

    // The file is keyed by product id, so it is stored once that id exists.
    if (pendingFile) {
      try {
        await putFile(productId, pendingFile)
        setPendingFile(null)
      } catch (error) {
        console.warn('MoonSprite studio: could not store the pack file.', error)
        setMessage(strings.errorFile)
        return
      }
    }
    setMessage(editing ? strings.updated : strings.published)
    if (editing) onDone?.()
    else reset()
  }

  const sizePresets = strings.presetSizes[category] ?? []

  return <div className="account-panel studio-publish">
    {editing && <p className="studio-editing">
      <Pencil aria-hidden="true" />{strings.editHint}
    </p>}
    {!editing && <p className="studio-hint">{strings.publishNote}</p>}

    <div className="studio-publish-grid">
      <form className="account-form studio-form" onSubmit={submit} noValidate>
        <fieldset className="studio-fieldset">
          <legend>{strings.groupBasics}</legend>
          <Field
            label={strings.fieldName}
            badge={strings.required}
            invalid={tried && name.trim().length < 2}
            counter={strings.counter(name.length, 48)}>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={48} />
          </Field>
          <div className="studio-row">
            <Field
              label={strings.fieldPrice}
              badge={strings.required}
              invalid={tried && !(Number(cny) > 0)}
              hint={<>
                {strings.fieldPriceHint}
                {priceUsd > 0 && <> · {strings.fieldPriceConverted(formatPrice(priceUsd))}</>}
              </>}>
              <input type="number" min="1" step="1" value={cny} onChange={(event) => setCny(event.target.value)} placeholder="29" />
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
        </fieldset>

        <fieldset className="studio-fieldset">
          <legend>{strings.groupContents}</legend>
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
        </fieldset>

        <fieldset className="studio-fieldset">
          <legend>{strings.groupListing}</legend>
          <Field
            label={strings.fieldTagline}
            badge={strings.optional}
            counter={strings.counter(tagline.length, 60)}>
            <input value={tagline} onChange={(event) => setTagline(event.target.value)} maxLength={60} />
          </Field>
          <Field
            label={strings.fieldBody}
            badge={strings.optional}
            counter={strings.counter(bodyText.length, 400)}>
            <textarea rows={4} value={bodyText} onChange={(event) => setBodyText(event.target.value)} maxLength={400} />
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
        </fieldset>

        <fieldset className="studio-fieldset">
          <legend>{strings.groupCover}</legend>
          {/* The native file control is hidden and driven from styled targets: its own
              button is drawn by the OS, which is what this design avoids. */}
          <input
            className="visually-hidden"
            id="studio-cover-input"
            type="file"
            accept="image/*"
            onChange={(event) => readCover(event.target.files?.[0])} />
          <div
            className={dragging ? 'cover-field dragging' : 'cover-field'}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              readCover(event.dataTransfer.files?.[0])
            }}>
            {cover
              ? <>
                <img src={cover} alt="" className="studio-cover-preview" />
                <div className="cover-actions">
                  <label className="button secondary compact" htmlFor="studio-cover-input">{strings.fieldCoverReplace}</label>
                  <Button size="compact" onClick={() => setCover(undefined)}>{strings.fieldCoverRemove}</Button>
                </div>
              </>
              : <label className="cover-empty" htmlFor="studio-cover-input">
                <ImagePlus aria-hidden="true" />
                <strong>{strings.fieldCoverHint}</strong>
                <small>{strings.fieldCoverDrop}</small>
              </label>}
          </div>
        </fieldset>

        {/* The deliverable itself. Without it a buyer would have nothing to download.
            This is the library's FileField, not a second hand-rolled drop zone. */}
        <fieldset className="studio-fieldset">
          <legend>{strings.groupFile}</legend>
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
            invalid={tried && !packFile && !editing}
            icon={<FileArchive aria-hidden="true" />} />
        </fieldset>

        {tried && missing.length > 0 && <p className="account-error" role="alert">
          {strings.missing}：{missing.join('、')}
        </p>}
        {message && <p className="studio-ok" role="status">{message}</p>}

        <div className="studio-submit">
          <Button type="submit" variant="primary"><PackagePlus aria-hidden="true" />{editing ? strings.saveEdit : strings.publish}</Button>
          {editing
            ? <Button size="compact" onClick={() => onDone?.()}>{strings.cancelEdit}</Button>
            : <Button size="compact" onClick={reset}>{strings.reset}</Button>}
        </div>
      </form>

      {/* The preview is the seller's own card, rendered from the real market component.
          It sits directly under the page title, so it is an h2: a heading that skips a
          level breaks screen-reader navigation. */}
      <aside className="studio-preview">
        <h2>{strings.previewTitle}</h2>
        <p className="studio-hint">{strings.previewHint}</p>
        <div className="studio-preview-card">
          <PackCard
            product={studioToProduct({
              id: editing?.id ?? 'preview',
              name: { zh: name || strings.previewPlaceholder, en: name || strings.previewPlaceholder },
              tagline: { zh: tagline, en: tagline },
              body: { zh: bodyText, en: bodyText },
              price: priceUsd,
              category,
              size: sizeText,
              formats,
              tags,
              image: cover,
              publishedAt: editing?.publishedAt ?? 0,
            })}
            t={t}
            language={language}
            cart={previewCart}
          />
        </div>
      </aside>
    </div>
  </div>
}
