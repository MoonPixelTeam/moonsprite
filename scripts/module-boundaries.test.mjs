import assert from 'node:assert/strict'
import test from 'node:test'
import { moduleBoundaryErrors, moduleBoundaryFindingsForFiles } from './check-module-boundaries.mjs'

test('领域契约不回流到类型总入口，快捷键匹配不加载语言标签', () => {
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/brush.ts', "import type { RgbaColor } from '@shared/types'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/brush.ts', "import type { RgbaColor } from '@shared/types-color'").length, 0)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/shortcuts.ts', "import { labels } from '@/locales/shortcuts'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/store/workspace-commands-color.ts', "import { tr } from './workspace-command-support'").length, 1)
})

test('解耦边界阻止兼容入口回流和业务模块引用根 Store', () => {
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/document-model.ts', "import { compositeRegion } from './document-composite'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/tools-fill.ts', "import { paintBrush } from './tools'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/tools-pixel-edit.ts', "import { compositeRegion } from './document-composite'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/store/workspace-commands-layer.ts', "import { useWorkspace } from './workspace'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/document-composite.ts', "import { getLayer } from './document-model'").length, 0)
})

test('根 Store 规模预算真实执行，不能重新堆积业务命令', () => {
  const oversized = Array.from({ length: 91 }, () => '// command').join('\n')
  assert.match(moduleBoundaryErrors('src/renderer/src/store/workspace.ts', oversized)[0], /模块规模/)
})

test('core 禁止依赖 React、Store 和平台模块', () => {
  const source = "import React from 'react'\nimport { useWorkspace } from '@/store/workspace'\nimport { api } from '@/platform/tauri-api'"
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/example.ts', source).length, 3)
})

test('非 platform 模块禁止直接访问 Tauri', () => {
  const source = "import { invoke } from '@tauri-apps/api/core'"
  assert.equal(moduleBoundaryErrors('src/renderer/src/components/Example.tsx', source).length, 1)
})

test('Store 禁止反向依赖组件', () => {
  const source = "import { Dialog } from '@/components/Dialog'"
  assert.equal(moduleBoundaryErrors('src/renderer/src/store/example.ts', source).length, 1)
})

test('画布各渲染通道都禁止依赖根 Store，独立契约仍可使用', () => {
  for (const name of ['frame', 'content', 'gradient', 'selection-preview', 'publish']) {
    const file = `src/renderer/src/components/canvas-render-${name}.ts`
    assert.equal(moduleBoundaryErrors(file, "import { useWorkspace } from '@/store/workspace'").length, 1)
    assert.equal(moduleBoundaryErrors(file, "import type { DocumentSession } from '@/store/workspace-types'").length, 0)
  }
})

test('渲染通道不能用总上下文重新绑定到画布调度器', () => {
  assert.equal(moduleBoundaryErrors('src/renderer/src/components/canvas-render-gradient.ts',
    "import type { CanvasRenderContext } from './canvas-render-frame'").length, 1)
})

test('既有边界债务也必须由扫描器报告并交给数字预算管理', () => {
  const tauriSource = "import { getCurrentWindow } from '@tauri-apps/api/window'"
  const storeSource = "import type { DocumentSession } from '@/store/workspace'"
  assert.equal(moduleBoundaryErrors('src/renderer/src/App.tsx', tauriSource).length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/app-render-keys.ts', storeSource).length, 1)
})

test('定向边界扫描只检查传入的变更文件，不要求完整债务预算', () => {
  const findings = moduleBoundaryFindingsForFiles([
    {
      file: 'src/renderer/src/components/Example.tsx',
      source: "import { invoke } from '@tauri-apps/api/core'",
    },
    {
      file: 'src/renderer/src/components/Toolbar.tsx',
      source: 'export const Toolbar = () => null',
    },
  ])
  assert.equal(findings.length, 1)
  assert.equal(findings[0].file, 'src/renderer/src/components/Example.tsx')
})


test('职责拆分不能通过新文件名绕过模型和聚合入口边界', () => {
  for (const family of ['canvas-input', 'document-composite', 'project-format', 'tools-selection-transform']) {
    assert.match(moduleBoundaryErrors('src/renderer/src/core/' + family + '-example.ts', "import type { Contract } from './" + family + "'")[0], /聚合入口/)
  }
  assert.match(moduleBoundaryErrors('src/renderer/src/components/canvas-composite-cache-selection.ts', "import { CanvasCompositeCache } from './canvas-composite-cache'")[0], /聚合入口/)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/document-model.ts', "import { compositeRegion } from './document-composite-region'").length, 1)
  assert.equal(moduleBoundaryErrors('src/renderer/src/core/tools-pixel-edit.ts', "import { DocumentCompositeCache } from './document-composite-cache'").length, 1)
  assert.match(moduleBoundaryErrors('src/renderer/src/components/canvas-input-selection.ts', "import { selectionInteractionHit } from '@/core/canvas-input'")[0], /聚合入口/)
  assert.equal(moduleBoundaryErrors('src/renderer/src/components/canvas-input-selection.ts', "import { selectionInteractionHit } from '@/core/canvas-input-hit-test'").length, 0)
  assert.equal(moduleBoundaryErrors('src/renderer/src/components/canvas-input-selection.ts', "import type { CanvasDragState } from '@/core/canvas-input-contracts'").length, 0)
})
