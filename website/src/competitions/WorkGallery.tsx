import { ActionButton } from '../ui'
import { useState } from 'react'
import type { Language } from '../content'
import { MediaPreview, type PreviewMedia } from '../ui/MediaPreview'
import { awardLabels, type CompetitionWork } from './data'
export function WorkGallery({ works, language }: { works: CompetitionWork[]; language: Language }) {
  const [preview, setPreview] = useState<PreviewMedia | null>(null)
  return <>
    <div className="competition-gallery">
      {works.map((work) => <figure className="competition-work" key={work.id}>
        <ActionButton type="button" className="competition-work-image" aria-label={`${language === 'zh' ? '放大作品：' : 'Enlarge artwork: '}${work.title[language]}`} onClick={() => setPreview({ src: work.image, title: work.title[language], description: awardLabels[work.award][language] })}>
          <img src={work.image} alt={work.title[language]} loading="lazy" decoding="async" />
          <span>{language === 'zh' ? '查看作品' : 'View artwork'}</span>
        </ActionButton>
        <figcaption><strong>{work.title[language]}</strong><span>{awardLabels[work.award][language]}</span></figcaption>
      </figure>)}
    </div>
    <MediaPreview media={preview} closeLabel={language === 'zh' ? '关闭' : 'Close'} onClose={() => setPreview(null)} />
  </>
}
