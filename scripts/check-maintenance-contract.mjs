import { access } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'AGENTS.md',
  'CHANGELOG.md',
  'docs/README.md',
  'docs/agent-workflow.md',
  'docs/product/behavior.md',
  'docs/architecture/overview.md',
  'docs/architecture/state-history.md',
  'docs/architecture/coordinates-rendering.md',
  'docs/interactions/pointer-modifiers.md',
  'docs/interactions/selection-transform.md',
  'docs/interactions/brush-color.md',
  'docs/interactions/workspace-docking.md',
  'docs/testing/regression-matrix.md',
  'docs/testing/performance-baseline.md',
  'docs/release/release-checklist.md',
  'docs/adr/README.md',
  'docs/templates/feature-spec.md',
  'docs/templates/bug-regression.md',
  '.github/workflows/ci.yml',
  '.github/pull_request_template.md',
]

const missing = []
for (const relativePath of requiredFiles) {
  try {
    await access(join(root, relativePath))
  } catch {
    missing.push(relativePath)
  }
}

if (missing.length > 0) {
  console.error('维护契约缺少必要文件：')
  for (const file of missing) console.error(`- ${file}`)
  process.exit(1)
}

console.log(`维护契约检查通过：${requiredFiles.length} 个文件存在。`)
