import { SettingsRow, Disclosure, FilterBar, Input, Textarea, Metric, RecordSection, StatusBadge, TaskLinks } from '../ui'
import { PixelCheck as Check, PixelDownload as Download, PixelPlus as Plus, PixelTrash2 as Trash2, PixelUpload as Upload, PixelX as X } from '../ui/icons'
import type { Copy, Language } from '../content'
import { Checkbox, EmptyState, LoadingState, SectionHeading, PageIntro, Alert, Button, Chip, Field, FormField, IconButton, Panel, PageHeader, Select } from '../ui'
import { ChipField } from '../ui/ChipField'
import { FileField } from '../ui/Field'
import { useState } from 'react'
import { ActionButton, AppWindow, ControlRow, DocsOutline, OutlineNav, PageShell, ProductImage, SteamButton, scrollToId } from '../ui'
import { MediaPreview } from '../ui/MediaPreview'
import * as PixelIcons from '../ui/icons'
import { PackGrid, PopularPackCard } from '../market/PackCard'
import { useCatalogue } from '../market/catalogue'

/*
 * The component library, rendered — not a mock-up of it. Every panel below mounts the
 * same components the pages mount, so this page fails the moment one of them breaks or
 * drifts. See docs/ui-design-system.md.
 */
export function UiPage({ t, language }: { t: Copy; language: Language }) {
  const [chip, setChip] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [actionCount, setActionCount] = useState(0)
  const [search, setSearch] = useState('')
  const sections = ['Workbench', 'MarketCards', 'ControlRow', 'Button', 'IconButton', 'Chip', 'Checkbox', 'Fields', 'ChipField', 'FileField', 'Alert', 'PageHeader', 'Media', 'Layout', 'Icons']
  const [removable, setRemovable] = useState(true)
  const [selected, setSelected] = useState('assets')
  const [formats, setFormats] = useState<string[]>(['PNG'])
  const [tags, setTags] = useState<string[]>(['瓦片集'])
  const [name, setName] = useState('深海瓦片集')
  const [file, setFile] = useState<{ name: string; size: number } | null>({ name: 'deep-sea.mspet', size: 1160 })
  const { products } = useCatalogue()

  return <main id="main" className="market">
    <PageIntro><PageHeader
          eyebrow="UI KIT"
          title="组件库"
          subtitle="真实组件、交互状态与组合示例。修改公共组件后，这里会同步更新。"
        /></PageIntro>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap ui-gallery">
        <nav className="ui-row" aria-label="组件目录">
          {sections.map((section) => <Chip key={section} onClick={() => scrollToId(`ui-${section}`)}>{section}</Chip>)}
        </nav>
        <Panel id="ui-Workbench" title="Workbench · 工作台组件">
          <FilterBar label="审核状态" value={selected} onChange={setSelected} options={[{ value: 'assets', label: '待审核' }, { value: 'pets', label: '已上架' }]} />
          <div className="ui-row"><StatusBadge>草稿</StatusBadge><StatusBadge tone="warning">待处理</StatusBadge><StatusBadge tone="success">已完成</StatusBadge><StatusBadge tone="danger">需修改</StatusBadge></div>
          <Metric label="已购作品" value="12" hint="可在订单详情中下载" />
          <TaskLinks label="账户服务" items={[{ href: '#/purchases', title: '购买与下载', description: '查看订单和交付文件', count: 12 }, { href: '#/support', title: '客服与工单', description: '提交问题并查看回复' }]} />
          <RecordSection title="订单下载问题" meta="订单 MS-2026-001" status={<StatusBadge tone="warning">待回复</StatusBadge>}>
            <Field label="标题"><Input placeholder="输入问题标题" /></Field>
            <Field label="回复内容"><Textarea rows={3} placeholder="输入具体解决办法" /></Field>
            <Field label="禁用状态"><Input disabled value="已关闭的工单" readOnly /></Field>
          </RecordSection>
        </Panel>
        <Panel id="ui-MarketCards" title="Market cards · 市场卡片">
          <p className="ui-note">资产包卡片用于市场列表，热门包卡片用于首页市场区。两者共享预览、价格和购物车交互，但展示密度各自独立。</p>
          <div className="ui-pack-card-group">
            <h3>AssetPackCard · 资产包卡片</h3>
            <PackGrid products={products.slice(0, 4)} t={t} language={language} className="ui-pack-grid" />
          </div>
          <div className="ui-pack-card-group">
            <h3>PopularPackCard · 热门包卡片</h3>
            <div className="shelf-stage ui-popular-pack-grid">
              {products.slice(0, 4).map((product) => <PopularPackCard product={product} t={t} language={language} key={product.id} />)}
            </div>
          </div>
        </Panel>
        <Panel title="SettingsRow / Disclosure · 设置行">
          <SettingsRow title="邮箱地址" description="用途说明与编辑区分开，窄屏自动堆叠。">
            <Field label="邮箱地址"><Input type="email" placeholder="name@example.com" /></Field>
            <div className="settings-actions"><Button>保存邮箱</Button></div>
            <Disclosure title="更多说明"><p className="panel-copy">低频设置默认折叠，可通过键盘展开。</p></Disclosure>
          </SettingsRow>
        </Panel>
        <Panel id="ui-ControlRow" title="ControlRow · 同排等高">
          <p className="ui-note">筛选、搜索、下拉和按钮共用 36px 高度。窄屏自动换行，不放大按钮。</p>
          <ControlRow>
            <Chip active={chip} onClick={() => setChip(!chip)}>全部 · 8</Chip>
            <Chip active={!chip} onClick={() => setChip(!chip)}>资产包 · 4</Chip>
            <Field label="搜索"><input type="search" placeholder="搜索包" value={search} onChange={(event) => setSearch(event.target.value)} /></Field>
            <FormField label="排序"><Select label="示例排序" value={selected} onChange={setSelected} options={[{ value: 'assets', label: '推荐顺序' }, { value: 'pets', label: '价格从低到高' }]} /></FormField>
            <Button onClick={() => setActionCount((count) => count + 1)}>购物车</Button>
          </ControlRow>
          <p className="ui-note" role="status">按钮已触发 {actionCount} 次{search ? ` · 搜索：${search}` : ''}</p>
        </Panel>
        <Panel title="Hierarchy & feedback">
          <SectionHeading eyebrow="MoonSprite" title={language === 'zh' ? '清晰、有序的创作空间' : 'A clear space to create'} description={language === 'zh' ? '标题引导阅读，颜色表达状态，作品承担视觉主角。' : 'Headings guide reading; colour communicates state; artwork takes the lead.'} />
          <EmptyState title={language === 'zh' ? '还没有作品' : 'No artwork yet'} action={<Button href="#/market">{t.nav.market}</Button>} />
          <LoadingState label={language === 'zh' ? '正在载入内容…' : 'Loading content…'} />
        </Panel>
        <Panel id="ui-Button" title="Button" icon={<Check aria-hidden="true" />}>
          <div className="ui-row">
            <Button variant="primary">主要操作</Button>
            <Button>次要操作</Button>
            <Button size="compact">紧凑</Button>
            <Button icon={<Plus aria-hidden="true" />}>带图标</Button>
            <Button disabled>禁用</Button>
            <Button href="#/market">链接式</Button>
          </div>
        </Panel>

        <Panel id="ui-IconButton" title="IconButton" icon={<Upload aria-hidden="true" />}>
          <div className="ui-row">
            <IconButton label="关闭" icon={<X />} />
            <IconButton label="下载" icon={<Download aria-hidden="true" />} />
            <IconButton label="删除" icon={<Trash2 aria-hidden="true" />} />
            <IconButton label="已选中" icon={<Check aria-hidden="true" />} active />
            <IconButton label="禁用" icon={<X />} disabled />
          </div>
        </Panel>

        <Panel id="ui-Chip" title="Chip" icon={<Plus aria-hidden="true" />}>
          <div className="ui-row">
            <Chip active={chip} onClick={() => setChip(!chip)}>可切换</Chip>
            <Chip>未选中</Chip>
            <Chip active>已选中</Chip>
            {removable && <Chip active onClick={() => setRemovable(false)}>可移除<X aria-hidden="true" /></Chip>}
            <Chip disabled>禁用</Chip>
          </div>
          <p className="ui-note">市场筛选、工作室预设、已选标签共用这一个组件。三处曾经各有一套内边距与选中样式。</p>
        </Panel>

        <Panel id="ui-Checkbox" title="Checkbox">
          <Checkbox label="可切换选项" checked={chip} onChange={setChip} />
          <fieldset disabled className="ui-disabled-fields"><Checkbox label="禁用选项" checked onChange={() => {}} /></fieldset>
        </Panel>

        <Panel id="ui-Fields" title="Field / FormField / Select" icon={<Check aria-hidden="true" />}>
          <Field label="包名称" badge="必填" counter={`${name.length} / 48`} hint="给买家看的名字">
            <input maxLength={48} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="出错时" badge="必填" invalid hint="字段自己会标红，不只靠顶部提示">
            <input value="" readOnly />
          </Field>
          <FormField label="分类">
            <Select
              value={selected}
              label="分类"
              onChange={setSelected}
              options={[
                { value: 'assets', label: '资产包' },
                { value: 'pets', label: '宠物包' },
                { value: 'bundles', label: '捆绑包' },
              ]} />
          </FormField>
          <FormField label="禁用的下拉框"><Select value="assets" label="禁用的分类" options={[{ value: 'assets', label: '资产包' }]} onChange={() => {}} disabled /></FormField>
          <Field label="多行输入"><textarea rows={3} placeholder="填写资源说明" /></Field>
          <Field label="禁用输入"><input value="不可编辑" disabled /></Field>
        </Panel>

        <Panel id="ui-ChipField" title="ChipField" icon={<Plus aria-hidden="true" />}>
          <ChipField
            label="包含格式"
            badge="必填"
            value={formats}
            presets={['PNG', 'GIF', 'Sprite sheet', '.mspet']}
            onChange={setFormats}
            customPlaceholder="自定义格式"
            addLabel="添加" />
          <ChipField
            label="标签"
            badge="选填"
            value={tags}
            presets={['瓦片集', '界面', '角色']}
            onChange={setTags}
            hint="用于市场筛选与搜索"
            customPlaceholder="自定义标签"
            addLabel="添加" />
        </Panel>

        <Panel id="ui-FileField" title="FileField" icon={<Upload aria-hidden="true" />}>
          <FileField
            label="包文件"
            badge="必填"
            file={file}
            onPick={(picked) => setFile({ name: picked.name, size: picked.size })}
            onClear={() => setFile(null)}
            emptyTitle="选择要交付的文件"
            emptyHint="也可以拖到这里"
            replaceLabel="更换文件"
            clearLabel="移除"
            hint="买家付款后下载的就是这个文件" />
          <FileField label="多文件选择" file={null} multiple onPickMany={(files) => setFile({ name: `${files.length} 个文件`, size: files.reduce((sum, item) => sum + item.size, 0) })} emptyTitle="选择多个文件" emptyHint="也可拖入多个文件" replaceLabel="更换" clearLabel="移除" />
          <FileField label="错误状态" file={null} invalid disabled emptyTitle="尚未选择文件" emptyHint="禁用状态示例" replaceLabel="更换" clearLabel="移除" />
        </Panel>

        <Panel id="ui-Alert" title="Alert">
          <Alert tone="info" icon={<Check aria-hidden="true" />}>信息提示</Alert>
          <Alert tone="success" icon={<Check aria-hidden="true" />}>已提交，审核通过后将在市场展示。</Alert>
          <Alert tone="warning" title="这是原型">金额与提现都不会真的执行。</Alert>
          <Alert tone="danger" role="alert">还差这些必填项：包文件</Alert>
        </Panel>

        <Panel id="ui-PageHeader" title="PageHeader / PageIntro / SectionHeading" icon={<Check aria-hidden="true" />}>
          <div className="ui-frame">
            <PageHeader
              level={2}
              eyebrow="STUDIO"
              title="创作者后台"
              subtitle="上传要卖的资产包，查看销售额与可提现金额。"
              back="#/account"
              backLabel="返回账号" />
          </div>
        </Panel>
        <Panel id="ui-Media" title="ActionButton / MediaPreview / AppWindow / ProductImage / SteamButton">
          <div className="ui-row"><Button onClick={() => setMediaOpen(true)}>打开媒体预览</Button><SteamButton label={t.common.steam} soon={t.common.steamSoon} /></div>
          <AppWindow title="ProductImage · 工作区预览">
            <ActionButton className="ui-media-action" aria-label="放大工作区预览" onClick={() => setMediaOpen(true)}><ProductImage name="workspace-v3" alt="MoonSprite 工作区" /></ActionButton>
          </AppWindow>
          <MediaPreview media={mediaOpen ? { src: '/assets/product/workspace-v3-1280.webp', title: '工作区预览' } : null} closeLabel="关闭预览" onClose={() => setMediaOpen(false)} />
        </Panel>
        <Panel id="ui-Layout" title="Panel / PageShell / OutlineNav / DocsOutline / LegalPage">
          <div className="ui-layout-example">
            <PageShell left={<OutlineNav items={[{ id: 'ui-layout-content', label: '示例正文' }]} activeId="ui-layout-content" />} right={<DocsOutline outline={[{ kind: 'group', id: 'guide', title: '文档目录', children: ['intro'] }]} sections={[{ id: 'intro', title: '使用指南' }]} currentId="intro" />}>
              <section id="ui-layout-content"><h3>三栏阅读布局</h3><p className="ui-note">左右目录与正文均使用真实组件。折叠目录可交互。</p></section>
            </PageShell>
          </div>
          <Button href="#/license">LegalPage · 查看完整法律页面组件</Button>
          <p className="ui-note">本组容器本身即为 Panel。空态与加载态见页面顶部示例。</p>
        </Panel>
        <Panel title="BackToTop · 回到顶部">
          <p className="ui-note">右下角常驻客服入口；滚动超过半屏后，下方显示顶部按钮。工作台返回右侧内容顶部；减少动态效果开启时直接跳转。</p>
        </Panel>
        <Panel id="ui-Icons" title="像素图标 · 22 × 22">
          <div className="ui-icon-grid">{Object.entries(PixelIcons).map(([name, Icon]) => <div key={name}><Icon aria-hidden="true" /><code>{name}</code></div>)}</div>
        </Panel>
      </div>
    </section>
  </main>
}
