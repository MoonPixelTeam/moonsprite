import { useState } from 'react'
import type { Language } from '../content'
import { Button, Chip, SectionHeading } from '../ui'
import { competition, competitionWorks, awardLabels, type CompetitionWork } from '../competitions/data'
import { WorkGallery } from '../competitions/WorkGallery'
export function CompetitionsPage({ language }: { language: Language }) {
  const [award, setAward] = useState<CompetitionWork['award'] | 'all'>('all')
  const works = competitionWorks.filter((work) => award === 'all' || work.award === award)
  return <main id="main" className="competition-page">
    <section className="competition-banner">
      <img src={competition.cover} alt="" />
      <div className="content-wrap competition-banner-content">
        <span>{language === 'zh' ? '已结束 · 作品展' : 'Completed · Exhibition'}</span>
        <p>{competition.subtitle[language]}</p>
        <h1>{competition.title[language]}</h1>
        <p>{competition.theme[language]}</p>
      </div>
    </section>
    <div className="content-wrap competition-main">
      <dl className="competition-facts">
        <div><dt>{language === 'zh' ? '比赛时间' : 'Dates'}</dt><dd>{competition.dates[language]}</dd></div>
        <div><dt>{language === 'zh' ? '展出作品' : 'Exhibited works'}</dt><dd>{competitionWorks.length}</dd></div>
        <div><dt>{language === 'zh' ? '赛事状态' : 'Status'}</dt><dd>{language === 'zh' ? '评选结束，作品持续展出' : 'Judging complete, exhibition open'}</dd></div>
      </dl>
      {competition.demo && <p className="competition-demo">{language === 'zh' ? '示例赛事：赛程与奖项为页面演示设定，展示图片来自本站现有画廊。' : 'Demo event: dates and awards are fictional; artwork is from the existing site gallery.'}</p>}
      <div className="home-section-head">
        <SectionHeading eyebrow="EXHIBITION" title={language === 'zh' ? '让每一个像素被看见。' : 'Every pixel deserves a spotlight.'} description={language === 'zh' ? '从月面基地到云间高塔，看看创作者笔下的六个世界。点击作品，放大欣赏细节。' : 'Six worlds, from lunar outposts to towers in the clouds. Open an artwork to explore its details.'} />
        <Button href="#/">{language === 'zh' ? '返回首页' : 'Back to home'}</Button>
      </div>
      <div className="competition-filters" aria-label={language === 'zh' ? '按奖项筛选' : 'Filter by award'}>
        <Chip active={award === 'all'} onClick={() => setAward('all')}>{language === 'zh' ? '全部作品' : 'All works'} · {competitionWorks.length}</Chip>
        {(['gold', 'silver', 'selection'] as const).map((value) => <Chip key={value} active={award === value} onClick={() => setAward(value)}>{awardLabels[value][language]} · {competitionWorks.filter((work) => work.award === value).length}</Chip>)}
      </div>
      <WorkGallery works={works} language={language} />
    </div>
  </main>
}
