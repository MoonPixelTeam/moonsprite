import { Input } from '../ui'
import { useState } from 'react'
import type { StudioProduct } from '../api'
import type { Language } from '../content'
import { Alert, Button, Checkbox, Field, FileField, Panel } from '../ui'
import { PetSpriteStrip } from '../market/PixelArt'

export type ListingDetails = Pick<StudioProduct, 'includes' | 'previews' | 'packs' | 'animations'>

async function readImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 512 * 1024) {
    throw new Error('Use PNG, JPG, WebP or GIF images under 512 KB.')
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image.'))
    reader.readAsDataURL(file)
  })
}

export function ListingFields({ value, onChange, category, products, language, onBusy }: {
  value: ListingDetails
  onChange: (value: ListingDetails) => void
  category: string
  products: StudioProduct[]
  language: Language
  onBusy: (busy: boolean) => void
}) {
  const zh = language === 'zh'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [animationName, setAnimationName] = useState('')
  const [duration, setDuration] = useState(1000)
  const update = (patch: ListingDetails) => onChange({ ...value, ...patch })
  const upload = async (files: File[], animation = false) => {
    if (!files.length || busy) return
    setBusy(true); onBusy(true); setError('')
    try {
      if (animation && (!animationName.trim() || !Number.isFinite(duration) || duration < 100 || duration > 60000)) throw new Error('animation')
      if (files.length > (animation ? 64 : 6 - (value.previews?.length ?? 0))) throw new Error('count')
      const ordered = animation ? [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : files
      const sources = await Promise.all(ordered.map(readImage))
      if (JSON.stringify(value).length + sources.join('').length > 2_000_000) throw new Error('size')
      if (animation) {
        const dimensions = await Promise.all(sources.map((src) => new Promise<{ width: number; height: number }>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
          image.onerror = () => reject(new Error('image'))
          image.src = src
        })))
        const first = dimensions[0]
        if (dimensions.some((size) => size.width !== first.width || size.height !== first.height)) throw new Error('dimensions')
        const id = crypto.randomUUID()
        const sheet = { dir: id, sources, frames: sources.length, frameWidth: first.width, frameHeight: first.height, duration }
        const previous = value.animations
        update({ animations: { order: [...(previous?.order ?? []), id], sheets: { ...previous?.sheets, [id]: sheet }, labels: { ...previous?.labels, [id]: { zh: animationName.trim(), en: animationName.trim() } }, idle: previous?.idle ?? sheet } })
        setAnimationName('')
      } else update({ previews: [...(value.previews ?? []), ...sources] })
    } catch {
      setError(zh ? '读取失败：最多 6 张预览图 / 每组 64 帧；单图不超过 512 KB，全部预览不超过 2 MB。动画需填写名称、100–60000 毫秒时长，且所有帧尺寸一致。' : 'Upload failed: up to 6 previews / 64 frames per animation, 512 KB per image and 2 MB total. Animations need a name, a 100–60000 ms duration and equally sized frames.')
    } finally { setBusy(false); onBusy(false) }
  }
  return <>
    <Panel title={zh ? '包含内容' : 'Included contents'}>
      <p className="studio-hint">{zh ? '逐项填写交付内容；会显示在详情页的内容清单中。' : 'List what buyers receive. These items appear on the detail page.'}</p>
      {(value.includes ?? []).map((item, index) => <div className="studio-listing-row" key={index}>
        <Field label={`${zh ? '内容' : 'Item'} ${index + 1}`}><Input maxLength={160} value={item.zh} onChange={(event) => update({ includes: value.includes?.map((entry, i) => i === index ? { ...entry, zh: event.target.value } : entry) })} /></Field>
        <Field label="English"><Input maxLength={160} value={item.en} onChange={(event) => update({ includes: value.includes?.map((entry, i) => i === index ? { ...entry, en: event.target.value } : entry) })} /></Field>
        <Button size="compact" onClick={() => update({ includes: value.includes?.filter((_, i) => i !== index) })}>{zh ? '移除' : 'Remove'}</Button>
      </div>)}
      <Button size="compact" disabled={(value.includes?.length ?? 0) >= 30} onClick={() => update({ includes: [...(value.includes ?? []), { zh: '', en: '' }] })}>{zh ? '添加内容项' : 'Add item'}</Button>
    </Panel>
    {category === 'bundles' && <Panel title={zh ? '合集成员' : 'Bundle members'}>
      <p className="studio-hint">{zh ? '选择自己的资源包，并上传包含全部成员文件的交付包。' : 'Choose your own packs and upload an archive containing all member files.'}</p>
      {products.filter((product) => product.category !== 'bundles').map((product) => <Checkbox key={product.id} label={product.name[language]} checked={value.packs?.includes(product.id) ?? false} onChange={(checked) => update({ packs: checked ? [...(value.packs ?? []), product.id] : value.packs?.filter((id) => id !== product.id) })} />)}
      {products.every((product) => product.category === 'bundles') && <p>{zh ? '请先发布至少一个独立资源包。' : 'Publish an individual pack first.'}</p>}
    </Panel>}
    <Panel title={zh ? '详情预览图' : 'Detail images'}>
      <FileField label={zh ? '添加图片（最多 6 张）' : 'Add images (up to 6)'} hint={zh ? '与卡片封面独立；未添加时使用封面。PNG / JPG / WebP / GIF，每张不超过 512 KB。' : 'Separate from the card cover; falls back to the cover. PNG / JPG / WebP / GIF, up to 512 KB each.'} file={null} multiple disabled={busy} accept="image/png,image/jpeg,image/webp,image/gif" onPickMany={(files) => { void upload(files) }} emptyTitle={zh ? '选择预览图片' : 'Choose preview images'} emptyHint={zh ? '可多选或拖入图片' : 'Select or drop multiple images'} replaceLabel={zh ? '更换' : 'Replace'} clearLabel={zh ? '移除' : 'Remove'} />
      <div className="studio-listing-images">{value.previews?.map((src, index) => <div key={index}>
        <img src={src} alt={`${zh ? '预览' : 'Preview'} ${index + 1}`} />
        <Button size="compact" disabled={busy || index === 0} onClick={() => { const next = [...value.previews!]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; update({ previews: next }) }}>{zh ? '前移' : 'Move earlier'}</Button>
        <Button size="compact" disabled={busy} onClick={() => update({ previews: value.previews?.filter((_, i) => i !== index) })}>{zh ? '移除' : 'Remove'}</Button>
      </div>)}</div>
    </Panel>
    {category === 'pets' && <Panel title={zh ? '宠物动画预览' : 'Pet animation previews'}>
      <p className="studio-hint">{zh ? '上传按文件名排序的逐帧图片（00.png、01.png…）。交付包单独上传；此处配置用于详情页播放。' : 'Upload frames in filename order (00.png, 01.png…). These previews are separate from the downloadable pack.'}</p>
      <Field label={zh ? '动画名称' : 'Animation name'}><Input maxLength={60} value={animationName} onChange={(event) => setAnimationName(event.target.value)} disabled={busy} /></Field>
      <Field label={zh ? '完整循环时长（毫秒）' : 'Loop duration (ms)'}><Input type="number" min={100} max={60000} value={duration} disabled={busy} onChange={(event) => setDuration(Number(event.target.value))} /></Field>
      <FileField label={zh ? '添加一组动画帧' : 'Add animation frames'} file={null} multiple disabled={busy} accept="image/png,image/webp" onPickMany={(files) => { void upload(files, true) }} emptyTitle={zh ? '选择动画帧' : 'Choose animation frames'} emptyHint={zh ? '可多选或拖入 PNG / WebP 图片' : 'Select or drop PNG / WebP frames'} replaceLabel={zh ? '更换' : 'Replace'} clearLabel={zh ? '移除' : 'Remove'} />
      {value.animations?.order.map((id) => <div className="studio-listing-row" key={id}>
        <PetSpriteStrip sheet={value.animations!.sheets[id]} />
        <Field label={zh ? '名称' : 'Name'}><Input value={value.animations!.labels[id].zh} maxLength={60} disabled={busy} onChange={(event) => update({ animations: { ...value.animations!, labels: { ...value.animations!.labels, [id]: { ...value.animations!.labels[id], zh: event.target.value } } } })} /></Field>
        <Field label="English"><Input value={value.animations!.labels[id].en} maxLength={60} disabled={busy} onChange={(event) => update({ animations: { ...value.animations!, labels: { ...value.animations!.labels, [id]: { ...value.animations!.labels[id], en: event.target.value } } } })} /></Field>
        <Button size="compact" disabled={busy || value.animations!.idle.dir === value.animations!.sheets[id].dir} onClick={() => update({ animations: { ...value.animations!, idle: value.animations!.sheets[id] } })}>{zh ? '设为默认' : 'Use as default'}</Button>
        <Button size="compact" disabled={busy} onClick={() => {
          const current = value.animations!
          const order = current.order.filter((key) => key !== id)
          const sheets = { ...current.sheets }; delete sheets[id]
          const labels = { ...current.labels }; delete labels[id]
          update({ animations: order.length ? { order, sheets, labels, idle: current.idle.dir === current.sheets[id].dir ? sheets[order[0]] : current.idle } : undefined })
        }}>{zh ? '移除' : 'Remove'}</Button>
      </div>)}
    </Panel>}
    {error && <Alert tone="danger" role="alert">{error}</Alert>}
  </>
}
