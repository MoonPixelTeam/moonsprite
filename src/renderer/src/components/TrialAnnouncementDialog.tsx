import { DialogHeader } from '@/components/DialogHeader'
import { ModalShell } from '@/components/ModalShell'

const trialSections = [
  { title: '先体验，再继续创作', items: ['无需安装，直接在浏览器中体验像素绘画与动画编辑。建议使用桌面浏览器和键盘鼠标。'] },
  { title: '请主动保存工程', items: ['试用版仅支持下载 .moonsprite 工程，不提供图片、精灵表或视频导出。', '点击右上角“保存工程”，文件会由浏览器下载。下载的工程可以重新导入，也可以在桌面版继续编辑和导出。'] },
  { title: '浏览器恢复不等于备份', items: ['恢复数据保存在当前浏览器中；清理网站数据、隐私模式或存储空间不足都可能影响恢复。', '刷新、关闭页面或返回官网前，请先保存工程。重要作品请保留下载副本。'] },
  { title: '完整功能在桌面版', items: ['本地文件夹、桌面扩展和部分系统功能在浏览器中不可用。可通过官网了解桌面版。'] }
] as const

export function TrialAnnouncementDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop modal-overlay-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <ModalShell storageKey="trial-announcement" defaultWidth={640} defaultHeight={580} minWidth={320} minHeight={360} maxWidth={760} maxHeight={800} fitContent={false} className="latest-release-modal" role="dialog" aria-modal="true" aria-labelledby="trial-announcement-title">
      <DialogHeader eyebrow="MOONSPRITE-TRY" title="在线试用说明" titleId="trial-announcement-title" closeLabel="关闭" onClose={onClose} />
      <div className="latest-release-body">
        <section className="latest-release-overview"><p>欢迎体验 MoonSprite。开始前，请了解如何保存你的作品。</p></section>
        {trialSections.map(section => <section className="latest-release-section" key={section.title}>
          <header><h3>{section.title}</h3></header>
          <ul>{section.items.map(item => <li key={item}><i aria-hidden="true" /><span>{item}</span></li>)}</ul>
        </section>)}
      </div>
      <footer><a className="quiet-button" href="https://moonsprite.art/" target="_blank" rel="noopener noreferrer">了解桌面版 ↗</a><button type="button" className="primary-button" onClick={onClose}>开始试用</button></footer>
    </ModalShell>
  </div>
}
