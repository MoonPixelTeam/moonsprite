import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { classifyValidationScope } from './validation-scope.mjs'
import { changedProjectFiles } from './project-paths.mjs'

const git = (args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' }).trim()
const splitLines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : []

const changedFiles = () => {
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') return []
  if (process.env.GITHUB_BASE_REF) {
    const mergeBase = git(['merge-base', 'HEAD', `origin/${process.env.GITHUB_BASE_REF}`])
    return changedProjectFiles(`${mergeBase}...HEAD`)
  }
  if (process.env.GITHUB_EVENT_BEFORE && !/^0+$/.test(process.env.GITHUB_EVENT_BEFORE)) {
    return changedProjectFiles(`${process.env.GITHUB_EVENT_BEFORE}..HEAD`)
  }
  return []
}

const scope = classifyValidationScope(changedFiles(), {
  forceFull: process.env.GITHUB_EVENT_NAME === 'workflow_dispatch',
})
const outputs = ['full', 'web', 'rust', 'thumbnail', 'desktop']
  .map((key) => `${key}=${scope[key]}`)
  .join('\n')

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${outputs}\n`, 'utf8')
console.log(`CI 验证范围：web=${scope.web}, rust=${scope.rust}, thumbnail=${scope.thumbnail}, desktop=${scope.desktop}`)
for (const file of scope.files) console.log(`- ${file}`)
