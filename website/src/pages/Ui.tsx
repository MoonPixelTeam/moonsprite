import { AlertTriangle, Check, Download, Plus, ShoppingCart, Trash2, Upload, X } from 'lucide-react'
import type { Copy, Language } from '../content'
import { Alert, Button, Chip, Field, FormField, IconButton, Panel, PageHeader, Select } from '../ui'
import { ChipField } from '../ui/ChipField'
import { FileField } from '../ui/Field'
import { useState } from 'react'

/*
 * The component library, rendered — not a mock-up of it. Every panel below mounts the
 * same components the pages mount, so this page fails the moment one of them breaks or
 * drifts. See docs/ui-design-system.md.
 */
export function UiPage({ t, language }: { t: Copy; language: Language }) {
  const [chip, setChip] = useState(false)
  const [selected, setSelected] = useState('assets')
  const [formats, setFormats] = useState<string[]>(['PNG'])
  const [tags, setTags] = useState<string[]>(['瓦片集'])
  const [name, setName] = useState('深海瓦片集')
  const [file, setFile] = useState<{ name: string; size: number } | null>({ name: 'deep-sea.mspet', size: 1160 })

  return <main id="main" className="market">
    <section className="market-shelf account-head">
      <div className="content-wrap">
        <PageHeader
          eyebrow="UI KIT"
          title="组件库"
          subtitle="官网所有界面元素都从这里取用。本页直接渲染真实组件，不是仿制样式，因此组件一旦损坏或走样，这里会立刻反映出来。"
        />
      </div>
    </section>

    <section className="market-browse">
      <div className="content-wrap purchases-wrap ui-gallery">
        <Panel title="Button" icon={<Check aria-hidden="true" />}>
          <div className="ui-row">
            <Button variant="primary">主要操作</Button>
            <Button>次要操作</Button>
            <Button size="compact">紧凑</Button>
            <Button variant="primary" icon={<ShoppingCart aria-hidden="true" />}>带图标</Button>
            <Button disabled>禁用</Button>
            <Button href="#/market">链接式</Button>
          </div>
        </Panel>

        <Panel title="IconButton" icon={<Upload aria-hidden="true" />}>
          <div className="ui-row">
            <IconButton label="购物车" icon={<ShoppingCart aria-hidden="true" />} />
            <IconButton label="下载" icon={<Download aria-hidden="true" />} />
            <IconButton label="删除" icon={<Trash2 aria-hidden="true" />} />
            <IconButton label="已选中" icon={<Check aria-hidden="true" />} active />
          </div>
        </Panel>

        <Panel title="Chip" icon={<Plus aria-hidden="true" />}>
          <div className="ui-row">
            <Chip active={chip} onClick={() => setChip(!chip)}>可切换</Chip>
            <Chip>未选中</Chip>
            <Chip active>已选中</Chip>
            <Chip active>可移除<X aria-hidden="true" /></Chip>
          </div>
          <p className="ui-note">市场筛选、工作室预设、已选标签共用这一个组件。三处曾经各有一套内边距与选中样式。</p>
        </Panel>

        <Panel title="Field / FormField / Select" icon={<Check aria-hidden="true" />}>
          <Field label="包名称" badge="必填" counter="6 / 48" hint="给买家看的名字">
            <input value={name} onChange={(event) => setName(event.target.value)} />
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
        </Panel>

        <Panel title="ChipField" icon={<Plus aria-hidden="true" />}>
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

        <Panel title="FileField" icon={<Upload aria-hidden="true" />}>
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
        </Panel>

        <Panel title="Alert" icon={<AlertTriangle aria-hidden="true" />}>
          <Alert tone="info" icon={<Check aria-hidden="true" />}>信息提示</Alert>
          <Alert tone="success" icon={<Check aria-hidden="true" />}>已上架，市场里立刻可以购买。</Alert>
          <Alert tone="warning" icon={<AlertTriangle aria-hidden="true" />} title="这是原型">金额与提现都不会真的执行。</Alert>
          <Alert tone="danger" icon={<AlertTriangle aria-hidden="true" />} role="alert">还差这些必填项：包文件</Alert>
        </Panel>

        <Panel title="PageHeader" icon={<Check aria-hidden="true" />}>
          <div className="ui-frame">
            <PageHeader
              eyebrow="STUDIO"
              title="创作者后台"
              subtitle="上传要卖的资产包，查看销售额与可提现金额。"
              back="#/account"
              backLabel="返回账号" />
          </div>
        </Panel>
      </div>
    </section>
  </main>
}
